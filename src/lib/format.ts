import type { Currency } from '@/db/types';

export const CURRENCY_SIGN: Record<Currency, string> = { RUB: '₽', TJS: 'смн', USD: '$' };

/** 12 345 ₽ */
export function fmtMoney(amount: number, currency: Currency = 'RUB'): string {
  const n = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount);
  return currency === 'USD' ? `$${n}` : `${n} ${CURRENCY_SIGN[currency]}`;
}

/** Склонение: plural(5, ['задача','задачи','задач']) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Склейка CSS-классов */
export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}
