// Общие функции шифрования (WebCrypto): ключ из пароля (PBKDF2-SHA256) и AES-GCM 256.
// Используются резервными копиями (src/lib/backup.ts) и облачной синхронизацией (src/sync).

export const PBKDF2_ITERATIONS = 310_000;

/** base64 без переполнения стека на больших данных */
export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Неизвлекаемый ключ AES-GCM из пароля: его нельзя прочитать даже из кода приложения */
export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Зашифровать строку: base64(iv[12] + шифротекст) */
export async function sealString(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toB64(out);
}

/** Расшифровать строку из sealString. Неверный ключ или подмена данных → исключение */
export async function openString(key: CryptoKey, sealed: string): Promise<string> {
  const all = fromB64(sealed);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, key, all.subarray(12));
  return new TextDecoder().decode(plain);
}
