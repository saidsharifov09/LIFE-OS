// Движок синхронизации: «получить новое из облака» → «отправить своё».
// Правило конфликтов: побеждает более новая правка (updatedAt). Всё, что уходит в облако, шифруется.
import Dexie, { type Table } from 'dexie';
import { db, DATA_TABLES } from '@/db/db';
import type { BaseRecord, Setting } from '@/db/types';
import { LOCAL_SETTING_KEYS } from '@/lib/backup';
import { deriveKey, fromB64, openString, PBKDF2_ITERATIONS, sealString, toB64 } from '@/lib/crypto';
import type { CloudApi, CloudRow } from './api';

// ---------- Служебная база синхронизации (отдельно от данных, в копии не попадает) ----------
interface KV { key: string; value: unknown }
interface Pushed { key: string; h: string }

class SyncDB extends Dexie {
  kv!: Table<KV, string>;
  pushed!: Table<Pushed, string>;
  constructor() {
    super('lifeos-sync');
    this.version(1).stores({ kv: 'key', pushed: 'key' });
  }
}
export const syncDb = new SyncDB();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await syncDb.kv.get(key))?.value as T | undefined;
}
export async function kvSet(key: string, value: unknown) {
  await syncDb.kv.put({ key, value });
}

/** Забыть состояние синхронизации (при выходе или смене аккаунта). Данные приложения не трогаются. */
export async function resetSyncState() {
  await syncDb.kv.clear();
  await syncDb.pushed.clear();
}

// ---------- Ключ шифрования ----------
const VAULT_CHECK = 'life-os-vault-v1';

export class WrongSyncPassword extends Error {
  constructor() { super('Неверный пароль синхронизации'); }
}

/**
 * Получить ключ из пароля. Если сейфа в облаке нет — создать (первое устройство).
 * Ключ неизвлекаемый, хранится в служебной базе этого устройства — пароль не нужно вводить при каждом запуске.
 */
export async function unlock(api: CloudApi, password: string): Promise<'created' | 'opened'> {
  const vault = await api.getVault();
  let key: CryptoKey;
  let result: 'created' | 'opened';
  if (!vault) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    await api.createVault({ salt: toB64(salt), iterations: PBKDF2_ITERATIONS, check_data: await sealString(key, VAULT_CHECK) });
    result = 'created';
  } else {
    key = await deriveKey(password, fromB64(vault.salt), vault.iterations);
    try {
      if ((await openString(key, vault.check_data)) !== VAULT_CHECK) throw new Error();
    } catch {
      throw new WrongSyncPassword();
    }
    result = 'opened';
  }
  // Другой аккаунт — начинаем синхронизацию с нуля
  if ((await kvGet<string>('userId')) !== api.userId()) await resetSyncState();
  await kvSet('userId', api.userId());
  await kvSet('key', key);
  return result;
}

export const getKey = () => kvGet<CryptoKey>('key');

// ---------- Синхронизация ----------

/** Быстрый хеш (cyrb53) — чтобы понять, менялась ли запись с последней отправки */
export function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const SETTINGS = 'settings';
const DELETED = '×';
const PAGE = 500;
const PUSH_BATCH = 200;

type AnyRec = (BaseRecord | Setting) & { id?: string; key?: string };
const recId = (tbl: string, r: AnyRec) => (tbl === SETTINGS ? (r as Setting).key : (r as BaseRecord).id);
const tableOf = (tbl: string) => db.table(tbl) as unknown as Table<AnyRec, string>;
const isSyncedSetting = (key: string) => !LOCAL_SETTING_KEYS.includes(key);

export interface SyncResult { pulled: number; pushed: number }

export async function syncOnce(api: CloudApi, key: CryptoKey): Promise<SyncResult> {
  const known = new Set<string>([...DATA_TABLES, SETTINGS]);
  let pulled = 0, pushed = 0;

  // 1. Получить из облака всё, что новее последнего известного номера
  let lastSeq = (await kvGet<number>('lastSeq')) ?? 0;
  for (;;) {
    const rows = await api.pull(lastSeq, PAGE);
    for (const row of rows) {
      lastSeq = Math.max(lastSeq, row.seq ?? lastSeq);
      if (!known.has(row.tbl)) continue; // раздел из более новой версии приложения
      if (row.tbl === SETTINGS && !isSyncedSetting(row.id)) continue;
      if (await applyRemote(row, key)) pulled++;
    }
    await kvSet('lastSeq', lastSeq);
    if (rows.length < PAGE) break;
  }

  // 2. Отправить изменённое на этом устройстве (сравнение с тем, что уже отправлено/получено)
  const pushedMap = new Map((await syncDb.pushed.toArray()).map((p) => [p.key, p.h]));
  const out: { row: CloudRow; k: string; h: string }[] = [];
  for (const tbl of known) {
    const local = new Map<string, AnyRec>();
    for (const r of await tableOf(tbl).toArray()) {
      const id = recId(tbl, r);
      if (tbl === SETTINGS && !isSyncedSetting(id)) continue;
      local.set(id, r);
      const json = JSON.stringify(r);
      const h = hash(json);
      const k = `${tbl}:${id}`;
      if (pushedMap.get(k) === h) continue;
      out.push({ row: { tbl, id, updated_at: r.updatedAt ?? 0, deleted: false, data: await sealString(key, json) }, k, h });
    }
    // Записи, удалённые навсегда (корзина очищена), — отправляем «надгробие»
    for (const [k, h] of pushedMap) {
      if (h === DELETED || !k.startsWith(`${tbl}:`)) continue;
      const id = k.slice(tbl.length + 1);
      if (!local.has(id)) out.push({ row: { tbl, id, updated_at: Date.now(), deleted: true, data: null }, k, h: DELETED });
    }
  }
  for (let i = 0; i < out.length; i += PUSH_BATCH) {
    const part = out.slice(i, i + PUSH_BATCH);
    await api.push(part.map((p) => p.row));
    await syncDb.pushed.bulkPut(part.map((p) => ({ key: p.k, h: p.h })));
    pushed += part.length;
  }
  await kvSet('lastSyncAt', Date.now());
  return { pulled, pushed };
}

/** Применить запись из облака. true — что-то изменилось на устройстве. */
async function applyRemote(row: CloudRow, key: CryptoKey): Promise<boolean> {
  const t = tableOf(row.tbl);
  const k = `${row.tbl}:${row.id}`;
  const local = await t.get(row.id);
  const localU = local?.updatedAt ?? -1;

  if (row.deleted || !row.data) {
    if (local && localU > row.updated_at) return false; // на устройстве правка новее — она уйдёт в облако
    await syncDb.pushed.put({ key: k, h: DELETED });
    if (!local) return false;
    await t.delete(row.id);
    return true;
  }
  if (local && localU > row.updated_at) return false;
  const json = await openString(key, row.data);
  const h = hash(json);
  // Эту же версию мы уже знали и удалили навсегда на этом устройстве — не воскрешаем (надгробие уйдёт при отправке)
  if (!local && (await syncDb.pushed.get(k))?.h === h) return false;
  await syncDb.pushed.put({ key: k, h });
  if (local && JSON.stringify(local) === json) return false;
  if (local && localU === row.updated_at) {
    // Одинаковое время, разное содержимое (почти невозможно) — оставляем своё, оно уйдёт в облако
    await syncDb.pushed.delete(k);
    return false;
  }
  await t.put(JSON.parse(json));
  return true;
}
