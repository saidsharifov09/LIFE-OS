// Автосинхронизация и состояние для индикатора «Синхронизировано / нет сети».
import { useSyncExternalStore } from 'react';
import Dexie from 'dexie';
import { AuthError, getConfig, getSession, OfflineError, SupabaseApi } from './api';
import { getKey, kvGet, syncOnce, type SyncResult } from './engine';

export type SyncStatus =
  | 'off'      // облако не настроено или не выполнен вход
  | 'locked'   // вход выполнен, но нет пароля синхронизации на этом устройстве
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface SyncState { status: SyncStatus; lastSyncAt: number | null; error?: string; last?: SyncResult }

let state: SyncState = { status: 'off', lastSyncAt: null };
const listeners = new Set<() => void>();
function set(s: Partial<SyncState>) {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
}
export const getSyncState = () => state;
export function useSyncState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSyncState);
}

export function api(): SupabaseApi | null {
  const c = getConfig();
  return c ? new SupabaseApi(c) : null;
}

/** Пересчитать статус без сети (после входа, выхода, ввода пароля) */
export async function refreshStatus() {
  const lastSyncAt = (await kvGet<number>('lastSyncAt')) ?? null;
  if (!getConfig() || !getSession()) return set({ status: 'off', lastSyncAt, error: undefined });
  if (!(await getKey())) return set({ status: 'locked', lastSyncAt, error: undefined });
  if (state.status === 'off' || state.status === 'locked') set({ status: navigator.onLine ? 'synced' : 'offline', lastSyncAt });
  else set({ lastSyncAt });
}

let running: Promise<void> | null = null;
let again = false;

/** Синхронизировать сейчас. Повторные вызовы во время работы объединяются. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const a = api();
      const key = await getKey();
      if (!a || !getSession() || !key) { await refreshStatus(); return; }
      if (!navigator.onLine) { set({ status: 'offline' }); return; }
      set({ status: 'syncing', error: undefined });
      const last = await syncOnce(a, key);
      set({ status: 'synced', lastSyncAt: Date.now(), last, error: undefined });
    } catch (e) {
      if (e instanceof OfflineError) set({ status: 'offline' });
      else if (e instanceof AuthError) { set({ status: 'off', error: e.message }); }
      else set({ status: 'error', error: (e as Error).message || 'Ошибка синхронизации' });
    } finally {
      running = null;
      if (again) { again = false; schedule(1500); }
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncNow(); }, ms);
}

let started = false;
/** Запустить автосинхронизацию: при запуске, после изменений (через 3 с), при появлении сети, раз в минуту */
export function startAutoSync() {
  if (started) return;
  started = true;
  void refreshStatus().then(() => syncNow());
  // Любое изменение в основной базе lifeos (не в служебной lifeos-sync)
  Dexie.on('storagemutated', (parts) => {
    if (!Object.keys(parts).some((k) => k.startsWith('idb://lifeos/'))) return;
    if (running) { again = true; return; }
    if (state.status !== 'off' && state.status !== 'locked') schedule(3000);
  });
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => state.status !== 'off' && state.status !== 'locked' && set({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 60_000);
}
