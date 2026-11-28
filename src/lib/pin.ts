// PIN-код для входа. ЧЕСТНО: это защита от посторонних глаз (дал телефон другу), а НЕ шифрование —
// данные в IndexedDB лежат как и без PIN. PIN — настройка конкретного устройства (localStorage),
// не синхронизируется и не попадает в резервную копию. Хранится только хеш (PBKDF2-SHA256 с солью).
import { fromB64, toB64 } from './crypto';

const KEY = 'lifeos.pin';
const FAILS_KEY = 'lifeos.pin.fails';
const ITERATIONS = 150_000;

export interface PinConfig {
  salt: string;
  hash: string;
  iterations: number;
  /** Длина PIN (4–6) — экран блокировки проверяет сразу после последней цифры */
  length: number;
  /** Через сколько минут в фоне блокировать; 0 — сразу */
  lockAfter: number;
}

/** Неверные попытки: после 5 подряд — пауза, растущая с каждой следующей ошибкой */
export interface PinFails {
  count: number;
  /** До какого времени (мс) ввод заблокирован */
  until: number;
}

export const LOCK_AFTER_OPTIONS = [0, 1, 5, 15] as const;

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}
function write(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch { /* приватный режим */ }
}

export const validPin = (pin: string) => /^\d{4,6}$/.test(pin);

export function getPinConfig(): PinConfig | null {
  const c = read<PinConfig>(KEY);
  return c && c.hash && c.salt ? c : null;
}
export const hasPin = () => !!getPinConfig();

async function hashPin(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return toB64(new Uint8Array(bits));
}

/** Установить (или сменить) PIN */
export async function setPin(pin: string, lockAfter = getPinConfig()?.lockAfter ?? 0): Promise<void> {
  if (!validPin(pin)) throw new Error('PIN — от 4 до 6 цифр');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPin(pin, salt, ITERATIONS);
  write(KEY, { salt: toB64(salt), hash, iterations: ITERATIONS, length: pin.length, lockAfter } satisfies PinConfig);
  write(FAILS_KEY, null);
}

export function clearPin() {
  write(KEY, null);
  write(FAILS_KEY, null);
}

export function setLockAfter(minutes: number) {
  const c = getPinConfig();
  if (c) write(KEY, { ...c, lockAfter: minutes });
}

export function getFails(): PinFails {
  return read<PinFails>(FAILS_KEY) ?? { count: 0, until: 0 };
}

/** Пауза после n-й ошибки подряд: 5 → 30 с, 6 → 1 мин, 7 → 2 мин … максимум 15 мин */
export function lockoutMs(count: number): number {
  if (count < 5) return 0;
  return Math.min(30_000 * 2 ** (count - 5), 15 * 60_000);
}

export type VerifyResult = { ok: true } | { ok: false; waitMs: number; left: number };

/** Проверить PIN. Учитывает паузу после неверных попыток (now — для тестов). */
export async function verifyPin(pin: string, now = Date.now()): Promise<VerifyResult> {
  const c = getPinConfig();
  if (!c) return { ok: true };
  const f = getFails();
  if (f.until > now) return { ok: false, waitMs: f.until - now, left: 0 };
  const hash = await hashPin(pin, fromB64(c.salt), c.iterations);
  if (hash === c.hash) {
    write(FAILS_KEY, null);
    return { ok: true };
  }
  const count = f.count + 1;
  const wait = lockoutMs(count);
  write(FAILS_KEY, { count, until: wait ? now + wait : 0 } satisfies PinFails);
  return { ok: false, waitMs: wait, left: Math.max(0, 5 - count) };
}
