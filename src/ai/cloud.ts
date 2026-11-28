// Уровни помощника и облачный ИИ (уровень 2).
// Запрос идёт в ВАШ проект Supabase → функция-посредник life-os-ai → бесплатный ИИ-сервис (Groq / Gemini / OpenRouter).
// Ключ ИИ-сервиса хранится только в секретах функции. В ИИ уходит лишь текст фразы и сегодняшняя дата:
// ИИ переводит фразу в план, а ответы («что у меня завтра?») приложение считает само из базы на устройстве.
import type { DateStr } from '@/db/types';
import { today as todayFn, weekday, WEEKDAYS_FULL } from '@/lib/dates';
import { getConfig, getSession, OfflineError, SupabaseApi } from '@/sync/api';
import { validateInterpretation, type Interpretation } from './plan';
import { interpretRules } from './rules';

export type AiLevel = 'rules' | 'cloud' | 'device';
export type AiProvider = 'auto' | 'groq' | 'gemini' | 'openrouter';
export interface AiSettings {
  level: AiLevel;
  provider: AiProvider;
  /** Пользователь согласился, что текст запросов уходит стороннему сервису */
  consent: boolean;
}

export const FUNCTION_NAME = 'life-os-ai';
const KEY = 'lifeos.ai';
const DEFAULTS: AiSettings = { level: 'rules', provider: 'auto', consent: false };

/** Настройка устройства (как тема): на iPhone и ноутбуке может отличаться */
export function getAiSettings(): AiSettings {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AiSettings>) }; } catch { return DEFAULTS; }
}
export function setAiSettings(s: Partial<AiSettings>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getAiSettings(), ...s })); } catch { /* приватный режим */ }
  window.dispatchEvent(new Event('lifeos-ai-settings'));
}

export const PROVIDER_LABEL: Record<AiProvider, string> = { auto: 'Авто', groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter' };

/** Почему облако не ответило — понятным языком */
export type CloudFail = 'not-configured' | 'not-signed-in' | 'offline' | 'limit' | 'no-function' | 'no-key' | 'forbidden' | 'bad-answer' | 'error';
export const FAIL_TEXT: Record<CloudFail, string> = {
  'not-configured': 'облако не подключено (Настройки → Облако)',
  'not-signed-in': 'нужно войти в облако (Настройки → Облако)',
  offline: 'нет сети',
  limit: 'бесплатный лимит ИИ на сейчас закончился',
  'no-function': 'в Supabase нет функции life-os-ai (см. инструкцию в Настройках)',
  'no-key': 'в секретах функции нет ключа ИИ-сервиса',
  forbidden: 'функция не пустила этот вход (проверьте ALLOWED_EMAILS)',
  'bad-answer': 'ИИ ответил непонятно',
  error: 'ошибка облачного ИИ',
};

export class CloudAiError extends Error {
  constructor(public reason: CloudFail, detail?: string) { super(detail ? `${FAIL_TEXT[reason]}: ${detail}` : FAIL_TEXT[reason]); }
}

/** Можно ли вообще пробовать облако (без сети не пробуем) */
export function cloudReady(): CloudFail | null {
  if (!getConfig()) return 'not-configured';
  if (!getSession()) return 'not-signed-in';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return null;
}

/** Вызвать функцию-посредник. Возвращает проверенный план. */
export async function askCloud(text: string, provider: AiProvider = 'auto', base: DateStr = todayFn()): Promise<Interpretation & { provider?: string }> {
  const cfg = getConfig();
  const ready = cloudReady();
  if (ready || !cfg) throw new CloudAiError(ready ?? 'not-configured');
  const api = new SupabaseApi(cfg);
  let token: string;
  try { token = await api.accessToken(); } catch (e) { throw new CloudAiError(e instanceof OfflineError ? 'offline' : 'not-signed-in'); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // Только фраза и дата — без данных из базы
      body: JSON.stringify({ text: text.slice(0, 2000), today: base, weekday: WEEKDAYS_FULL[weekday(base)], provider }),
    });
  } catch {
    throw new CloudAiError('offline');
  } finally {
    clearTimeout(timer);
  }
  let body: { plan?: unknown; provider?: string; error?: string; code?: string } = {};
  try { body = await r.json(); } catch { /* не JSON */ }
  if (!r.ok) {
    if (r.status === 404) throw new CloudAiError('no-function');
    if (r.status === 429 || body.code === 'limit') throw new CloudAiError('limit');
    if (body.code === 'no-key') throw new CloudAiError('no-key');
    if (r.status === 401) throw new CloudAiError('not-signed-in');
    if (r.status === 403) throw new CloudAiError('forbidden');
    throw new CloudAiError('error', body.error);
  }
  const plan = validateInterpretation(body.plan);
  if (!plan.steps.length && !plan.query && !plan.reply) throw new CloudAiError('bad-answer');
  return { ...plan, provider: body.provider };
}

export interface Interpreted extends Interpretation {
  /** Кто разобрал: шаблоны или облачный ИИ */
  by: 'rules' | 'cloud';
  provider?: string;
  /** Пояснение, если облако не ответило и сработал запасной разбор */
  notice?: string;
}

/**
 * Разобрать фразу на выбранном уровне. Облако не ответило (нет сети, лимит, ошибка) —
 * сразу шаблонный разбор и пояснение, почему.
 */
export async function interpret(text: string, settings: AiSettings = getAiSettings(), ask = askCloud): Promise<Interpreted> {
  if (settings.level === 'cloud' && settings.consent) {
    try {
      const res = await ask(text, settings.provider);
      return { ...res, by: 'cloud' };
    } catch (e) {
      const reason = e instanceof CloudAiError ? e.message : FAIL_TEXT.error;
      return { ...interpretRules(text), by: 'rules', notice: `Облачный ИИ недоступен — ${reason}. Разобрал сам, без ИИ.` };
    }
  }
  return { ...interpretRules(text), by: 'rules' };
}
