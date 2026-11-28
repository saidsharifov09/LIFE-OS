import { beforeEach, describe, expect, it } from 'vitest';
import { clearPin, getPinConfig, hasPin, lockoutMs, setLockAfter, setPin, validPin, verifyPin } from './pin';

// В Node нет localStorage — простая замена в памяти
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}
beforeEach(() => localStorage.clear());

describe('PIN-код', () => {
  it('формат: 4–6 цифр', () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('123456')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('12a4')).toBe(false);
    expect(validPin('1234567')).toBe(false);
  });

  it('хранится только хеш с солью; верный PIN проходит, неверный — нет', async () => {
    await setPin('2580');
    const raw = localStorage.getItem('lifeos.pin')!;
    expect(raw).not.toContain('2580');
    expect(getPinConfig()).toMatchObject({ length: 4, lockAfter: 0 });
    expect(await verifyPin('2580')).toEqual({ ok: true });
    expect((await verifyPin('0000')).ok).toBe(false);
  });

  it('одинаковый PIN — разная соль и хеш', async () => {
    await setPin('1111');
    const a = getPinConfig()!;
    await setPin('1111');
    const b = getPinConfig()!;
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('после 5 ошибок — пауза; во время паузы даже верный PIN не проверяется', async () => {
    await setPin('1234');
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(await verifyPin('9999', t)).toMatchObject({ ok: false, waitMs: 0 });
    const r = await verifyPin('9999', t);
    expect(r).toMatchObject({ ok: false, waitMs: 30_000 });
    expect((await verifyPin('1234', t + 1000)).ok).toBe(false);
    expect(await verifyPin('1234', t + 31_000)).toEqual({ ok: true });
    // Счётчик сброшен — снова 5 попыток до паузы
    expect(await verifyPin('9999', t + 32_000)).toMatchObject({ ok: false, waitMs: 0, left: 4 });
  });

  it('пауза растёт, но не больше 15 минут', () => {
    expect(lockoutMs(4)).toBe(0);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(6)).toBe(60_000);
    expect(lockoutMs(20)).toBe(15 * 60_000);
  });

  it('время блокировки и выключение', async () => {
    await setPin('123456', 5);
    expect(getPinConfig()?.lockAfter).toBe(5);
    setLockAfter(1);
    expect(getPinConfig()?.lockAfter).toBe(1);
    await setPin('654321'); // смена PIN сохраняет время блокировки
    expect(getPinConfig()).toMatchObject({ lockAfter: 1, length: 6 });
    clearPin();
    expect(hasPin()).toBe(false);
    expect(await verifyPin('0000')).toEqual({ ok: true });
  });
});
