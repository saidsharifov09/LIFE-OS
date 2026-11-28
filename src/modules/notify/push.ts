// Уведомления при закрытом приложении (Web Push) — клиентская часть.
// Как работает: телефон подписывается у своего push-сервиса (Apple/Google), подписка сохраняется в вашем Supabase.
// Приложение отправляет туда расписание напоминаний на 14 дней (по умолчанию только время, без названий дел),
// а будильник pg_cron раз в минуту вызывает функцию life-os, и она присылает созревшие уведомления.
// На iPhone работает только у приложения, добавленного на экран «Домой» (iOS 16.4+).
import { useEffect } from 'react';
import Dexie from 'dexie';
import { db } from '@/db/db';
import { alive } from '@/actions';
import { planPush } from '@/lib/pushPlan';
import { callFunction, functionReady } from '@/sync/functions';

const KEY = 'lifeos.push';

export interface PushSettings {
  enabled: boolean;
  /** Показывать названия дел в уведомлениях (тогда названия хранятся на сервере в открытом виде) */
  showTitles: boolean;
  /** Отпечаток последнего отправленного расписания и время отправки */
  lastHash?: string;
  lastSyncAt?: number;
  lastCount?: number;
  lastError?: string;
}

export function getPushSettings(): PushSettings {
  try { return { enabled: false, showTitles: false, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PushSettings>) }; } catch { return { enabled: false, showTitles: false }; }
}
export function savePushSettings(p: Partial<PushSettings>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getPushSettings(), ...p })); } catch { /* приватный режим */ }
  window.dispatchEvent(new Event('lifeos-push'));
}

export type PushSupport = 'ok' | 'install' | 'unsupported';

/** Что умеет это устройство: на iPhone push есть только у приложения с экрана «Домой» */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (ios && !standalone) return 'install';
  return has ? 'ok' : ios ? 'install' : 'unsupported';
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Сервис-воркер не запустился — обновите страницу')), 10_000)),
  ]);
  return reg;
}

/** Включить: разрешение → подписка → сохранить в облаке → отправить расписание. Вызывать из нажатия кнопки. */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'Уведомления запрещены. iPhone: Настройки → Уведомления → Life OS → Допуск уведомлений.'
    : 'Разрешение не дано');
  const { publicKey } = await callFunction<{ publicKey: string }>('push-key');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // Ключ сервера сменился (пересоздали таблицы) — переподписываемся
  if (sub && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = keyBytes(publicKey);
    if (cur.length !== want.length || cur.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await callFunction('push-subscribe', { subscription: sub.toJSON() });
  savePushSettings({ enabled: true, lastHash: undefined, lastError: undefined });
  await syncPush(true);
}

export async function disablePush(): Promise<void> {
  savePushSettings({ enabled: false, lastHash: undefined });
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await callFunction('push-unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* нет сервис-воркера — нечего отключать */ }
}

export async function testPush(): Promise<number> {
  const r = await callFunction<{ sent: number }>('push-test');
  return r.sent;
}

let syncing: Promise<void> | null = null;

/** Отправить расписание, если оно изменилось (или прошло 6 часов). force — отправить в любом случае. */
export function syncPush(force = false): Promise<void> {
  const s = getPushSettings();
  if (!s.enabled || functionReady()) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const events = (await db.events.toArray()).filter(alive);
      const tasks = (await db.tasks.toArray()).filter(alive);
      const items = planPush(events, tasks, { showTitles: s.showTitles });
      const hash = String(hashStr(JSON.stringify(items)));
      const stale = !s.lastSyncAt || Date.now() - s.lastSyncAt > 6 * 3600_000;
      if (!force && hash === s.lastHash && !stale) return;
      const r = await callFunction<{ count: number }>('push-sync', { items });
      savePushSettings({ lastHash: hash, lastSyncAt: Date.now(), lastCount: r.count, lastError: undefined });
    } catch (e) {
      savePushSettings({ lastError: (e as Error).message });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

/** Держать расписание на сервере актуальным: при запуске, после изменений задач/событий, при возвращении в приложение */
export function usePushAutoSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (ms = 4000) => { clearTimeout(timer); timer = setTimeout(() => void syncPush(), ms); };
    later(3000);
    const onChange = (parts: Record<string, unknown>) => {
      if (!getPushSettings().enabled) return;
      if (Object.keys(parts).some((k) => /\/(tasks|events)\//.test(k) || /(tasks|events)$/.test(k))) later();
    };
    Dexie.on('storagemutated', onChange);
    const onVis = () => { if (document.visibilityState === 'visible') later(1500); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      Dexie.on('storagemutated').unsubscribe(onChange);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}

/** Есть ли тут сейчас действующая подписка (для подписи в настройках) */
export async function hasSubscription(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager?.getSubscription());
  } catch { return false; }
}

