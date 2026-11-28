// Проверка серверной части уведомлений (supabase/functions/life-os): шифрование Web Push и подпись VAPID.
// Получатель расшифровывает сообщение по RFC 8291 — как это делает браузер.
import { describe, expect, it } from 'vitest';
import { b64url, encryptPayload, fromB64url, generateVapid, sendPush, vapidHeader } from '../../supabase/functions/life-os/index';

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const te = new TextEncoder();

/** Браузерная сторона: подписка (ключи получателя) и расшифровка */
async function receiver() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const decrypt = async (body: Uint8Array) => {
    const salt = body.slice(0, 16);
    const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
    const idlen = body[20];
    const asPub = body.slice(21, 21 + idlen);
    const cipher = body.slice(21 + idlen);
    const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, kp.privateKey, 256));
    const ikm = await hkdf(auth, ecdh, cat(te.encode('WebPush: info\0'), pub, asPub), 32);
    const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
    const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cipher));
    expect(rs).toBe(4096);
    expect(plain[plain.length - 1]).toBe(2); // разделитель последней записи
    return new TextDecoder().decode(plain.slice(0, -1));
  };
  return { p256dh: b64url(pub), auth: b64url(auth), decrypt };
}

describe('Web Push на сервере', () => {
  it('браузер расшифровывает уведомление', async () => {
    const r = await receiver();
    const body = await encryptPayload(te.encode('{"title":"Life OS","body":"Пора"}'), r.p256dh, r.auth);
    expect(JSON.parse(await r.decrypt(body))).toEqual({ title: 'Life OS', body: 'Пора' });
  });

  it('подпись VAPID проверяется публичным ключом; адресат — origin push-сервиса', async () => {
    const v = await generateVapid();
    const h = await vapidHeader('https://web.push.apple.com/abc/def', v, 'https://x.supabase.co', 1_800_000_000);
    const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(v.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: 1_800_003_600, sub: 'https://x.supabase.co' });
    const pub = await crypto.subtle.importKey('raw', fromB64url(v.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(m[3]), te.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it('sendPush: правильные заголовки и тело', async () => {
    const r = await receiver();
    const v = await generateVapid();
    let seen: { url: string; init: RequestInit } | null = null;
    const status = await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: r.p256dh, auth: r.auth }, { title: 'T', body: 'B' }, v, 'mailto:a@b.c',
      (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 201 }); }) as unknown as typeof fetch);
    expect(status).toBe(201);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(/^vapid t=/);
    expect(JSON.parse(await r.decrypt(seen!.init.body as Uint8Array))).toEqual({ title: 'T', body: 'B' });
  });
});
