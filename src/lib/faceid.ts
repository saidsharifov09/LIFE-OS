// Вход по Face ID / Touch ID (на ноутбуке — Windows Hello) вместо набора PIN.
// Как устроено: при включении создаётся ключ входа (passkey) этого сайта, защищённый биометрией устройства.
// Разблокировка — запрос этого ключа: iPhone показывает Face ID, и только после успешной проверки браузер его отдаёт.
// ЧЕСТНО: как и PIN, это защита от посторонних глаз, а не шифрование данных. PIN остаётся запасным способом.
// Настройка устройства (localStorage), не синхронизируется.

const KEY = 'lifeos.faceid';

interface FaceIdConfig { credId: string; createdAt: number }

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function read(): FaceIdConfig | null {
  try { const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as FaceIdConfig | null; return c?.credId ? c : null; } catch { return null; }
}

export const faceIdEnabled = () => !!read();

export function disableFaceId() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
}

/** Есть ли на устройстве встроенная биометрия, доступная сайту */
export async function faceIdAvailable(): Promise<boolean> {
  try {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Как назвать биометрию на этом устройстве */
export function biometryName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad/.test(ua)) return 'Face ID';
  if (/Macintosh/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'Face ID / Touch ID';
}

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** Включить: создать ключ входа. Вызывать из нажатия кнопки (iPhone требует). */
export async function enableFaceId(): Promise<void> {
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Life OS' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Life OS', displayName: 'Life OS — вход' },
      challenge: challenge(),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      attestation: 'none',
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Не получилось');
  try { localStorage.setItem(KEY, JSON.stringify({ credId: b64url(cred.rawId), createdAt: Date.now() } satisfies FaceIdConfig)); } catch { /* */ }
}

/** Разблокировать: true — устройство подтвердило владельца. Отмена или ошибка — false (остаётся PIN). */
export async function unlockWithFaceId(): Promise<boolean> {
  const c = read();
  if (!c) return false;
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        allowCredentials: [{ type: 'public-key', id: fromB64url(c.credId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    }) as PublicKeyCredential | null;
    if (!cred) return false;
    const resp = cred.response as AuthenticatorAssertionResponse;
    // Флаг «пользователь проверен» (UV, бит 2) в данных устройства — подтверждение, что был Face ID / код устройства
    const flags = new Uint8Array(resp.authenticatorData)[32];
    return b64url(cred.rawId) === c.credId && (flags & 0x04) !== 0;
  } catch {
    return false;
  }
}
