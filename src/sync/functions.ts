// Вызов серверной функции life-os в вашем проекте Supabase (ИИ-посредник и уведомления).
// Вход — тот же, что у синхронизации (адрес проекта, публичный ключ и сессия хранятся на устройстве).
import { getConfig, getSession, OfflineError, SupabaseApi } from './api';

export const FUNCTION_NAME = 'life-os';

export type FnFail = 'not-configured' | 'not-signed-in' | 'offline' | 'no-function' | 'setup' | 'forbidden' | 'limit' | 'no-key' | 'error';

export class FunctionError extends Error {
  constructor(public reason: FnFail, public status = 0, detail?: string) { super(detail || reason); }
}

/** Адрес функции в проекте (для SQL будильника уведомлений) */
export function functionUrl(): string | null {
  const cfg = getConfig();
  return cfg ? `${cfg.url}/functions/v1/${FUNCTION_NAME}` : null;
}

/** Готова ли связь с облаком (без сети не пробуем) */
export function functionReady(): FnFail | null {
  if (!getConfig()) return 'not-configured';
  if (!getSession()) return 'not-signed-in';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return null;
}

export async function callFunction<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> {
  const cfg = getConfig();
  const ready = functionReady();
  if (ready || !cfg) throw new FunctionError(ready ?? 'not-configured');
  let token: string;
  try { token = await new SupabaseApi(cfg).accessToken(); } catch (e) { throw new FunctionError(e instanceof OfflineError ? 'offline' : 'not-signed-in'); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new FunctionError('offline');
  } finally {
    clearTimeout(timer);
  }
  let body: Record<string, unknown> = {};
  try { body = await r.json(); } catch { /* не JSON */ }
  if (!r.ok) {
    const code = String(body.code ?? '');
    const msg = typeof body.error === 'string' ? body.error : undefined;
    if (r.status === 404) throw new FunctionError('no-function', 404);
    if (r.status === 429 || code === 'limit') throw new FunctionError('limit', r.status);
    if (code === 'no-key') throw new FunctionError('no-key', r.status);
    if (code === 'setup') throw new FunctionError('setup', r.status, msg);
    if (r.status === 401) throw new FunctionError('not-signed-in', 401);
    if (r.status === 403) throw new FunctionError('forbidden', 403);
    throw new FunctionError('error', r.status, msg);
  }
  return body as T;
}

/** Код функции целиком — чтобы вставить его в редактор функции на сайте Supabase (с iPhone, без командной строки) */
export async function functionCode(): Promise<string> {
  return (await import('../../supabase/functions/life-os/index.ts?raw')).default;
}

/** SQL для уведомлений с адресом вашего проекта */
export async function pushSql(): Promise<string | null> {
  const url = functionUrl();
  if (!url) return null;
  return (await import('../../supabase/push.sql?raw')).default.replace('__FUNCTION_URL__', url);
}
