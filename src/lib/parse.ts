// Распознавание подсказок в тексте быстрого захвата.
// Принцип: «без самодеятельности» — мы только ПРЕДЛАГАЕМ дату/время/сумму,
// исходный текст сохраняется как есть, а применяет подсказку пользователь.
import type { CaptureHints, Currency, DateStr } from '@/db/types';
import { addDays, addMonths, fromDateStr, toDateStr, today as todayFn, weekday } from './dates';

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/^(понедельник\S*|пн)$/, 0],
  [/^(вторник\S*|вт)$/, 1],
  [/^(сред[ауы]|ср)$/, 2],
  [/^(четверг\S*|чт)$/, 3],
  [/^(пятниц[ауы]|пт)$/, 4],
  [/^(суббот[ауы]|сб)$/, 5],
  [/^(воскресень[ея]|вс)$/, 6],
];

const MONTH_STEMS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function monthFromWord(w: string): number {
  if (/^мая|^май/.test(w)) return 4;
  for (let i = 0; i < MONTH_STEMS.length; i++) {
    if (i === 4) continue;
    if (w.startsWith(MONTH_STEMS[i])) return i;
  }
  return -1;
}

const CURRENCY_RE = /^(₽|р\.?|руб\S*|rub|\$|usd|долл\S*|смн|сомон\S*|tjs)$/i;
function currencyFromWord(w: string): Currency | null {
  const s = w.toLowerCase();
  if (/^(₽|р\.?|руб|rub)/.test(s)) return 'RUB';
  if (/^(\$|usd|долл)/.test(s)) return 'USD';
  if (/^(смн|сомон|tjs)/.test(s)) return 'TJS';
  return null;
}

const INCOME_WORDS = /(зарплат|получил|получила|доход|аванс|премия|вернули|кэшбек|кешбэк)/i;

interface Token {
  raw: string;
  low: string;
  used: boolean;
}

/** Разбирает строку и возвращает подсказки. base — «сегодня» (для тестов). */
export function parseCapture(text: string, base: DateStr = todayFn()): CaptureHints {
  // Отделяем знаки валют, приклеенные к числу: «250₽», «$20»
  const prepared = text.replace(/(\d)(₽|\$)/g, '$1 $2').replace(/(\$)(\d)/g, '$1 $2');
  const tokens: Token[] = prepared.split(/\s+/).filter(Boolean).map((raw) => ({
    raw,
    low: raw.toLowerCase().replace(/[,!?;]+$/, ''),
    used: false,
  }));
  const hints: CaptureHints = {};
  const use = (...idx: number[]) => idx.forEach((i) => tokens[i] && (tokens[i].used = true));
  const isPrep = (i: number) => i >= 0 && /^(в|во|к|на|до)$/.test(tokens[i]?.low ?? '');

  // ---- Даты ----
  for (let i = 0; i < tokens.length && !hints.date; i++) {
    const w = tokens[i].low;
    if (w === 'сегодня') { hints.date = base; use(i); continue; }
    if (w === 'завтра') { hints.date = addDays(base, 1); use(i); continue; }
    if (w === 'послезавтра') { hints.date = addDays(base, 2); use(i); continue; }
    if (w === 'вчера') { hints.date = addDays(base, -1); use(i); continue; }

    // через N дней / через неделю / через месяц
    if (w === 'через') {
      const n1 = tokens[i + 1]?.low ?? '';
      const n = /^\d+$/.test(n1) ? Number(n1) : null;
      const unit = n !== null ? tokens[i + 2]?.low ?? '' : n1;
      const k = n ?? 1;
      let d: DateStr | null = null;
      if (/^д(ень|ня|ней)$/.test(unit)) d = addDays(base, k);
      else if (/^недел/.test(unit)) d = addDays(base, 7 * k);
      else if (/^месяц/.test(unit)) d = addMonths(base, k);
      if (d) { hints.date = d; use(i, i + 1, ...(n !== null ? [i + 2] : [])); continue; }
    }

    // (в) пятницу
    for (const [re, wd] of WEEKDAY_WORDS) {
      if (re.test(w)) {
        // короткие формы (пн, вт…) принимаем только с предлогом, чтобы не ловить случайные слова
        if (w.length === 2 && !isPrep(i - 1)) break;
        let delta = (wd - weekday(base) + 7) % 7;
        if (tokens[i - 1]?.low === 'следующ' || /^следующ/.test(tokens[i - 1]?.low ?? '')) { delta = delta === 0 ? 7 : delta + 7; use(i - 1); }
        hints.date = addDays(base, delta);
        use(i);
        if (isPrep(i - 1)) use(i - 1);
        break;
      }
    }
    if (hints.date) continue;

    // 05.12 или 5.12.2026
    const m1 = w.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
    if (m1 && !isTimePrefixed(tokens, i)) {
      const d = Number(m1[1]), mo = Number(m1[2]) - 1;
      let y = m1[3] ? Number(m1[3].length === 2 ? '20' + m1[3] : m1[3]) : fromDateStr(base).getFullYear();
      if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) {
        let ds = toDateStr(new Date(y, mo, d));
        if (!m1[3] && ds < base) { y += 1; ds = toDateStr(new Date(y, mo, d)); }
        hints.date = ds; use(i); continue;
      }
    }

    // 5 декабря
    if (/^\d{1,2}$/.test(w) && tokens[i + 1]) {
      const mo = monthFromWord(tokens[i + 1].low);
      const d = Number(w);
      if (mo >= 0 && d >= 1 && d <= 31) {
        let y = fromDateStr(base).getFullYear();
        let ds = toDateStr(new Date(y, mo, d));
        if (ds < base) { y += 1; ds = toDateStr(new Date(y, mo, d)); }
        hints.date = ds; use(i, i + 1);
        if (isPrep(i - 1)) use(i - 1);
        continue;
      }
    }
  }

  // ---- Время ----
  for (let i = 0; i < tokens.length && !hints.time; i++) {
    if (tokens[i].used) continue;
    const w = tokens[i].low;
    // 15:00 или «в 15.30»
    const m = w.match(/^(\d{1,2})[:.](\d{2})$/);
    if (m && (w.includes(':') || isPrep(i - 1))) {
      const h = Number(m[1]), mi = Number(m[2]);
      if (h < 24 && mi < 60) {
        hints.time = `${String(h).padStart(2, '0')}:${m[2]}`;
        use(i);
        if (isPrep(i - 1)) use(i - 1);
        continue;
      }
    }
    // «в 15», «в 7 вечера», «в 9 утра», «в 3 часа»
    if (/^\d{1,2}$/.test(w) && /^(в|во|к)$/.test(tokens[i - 1]?.low ?? '')) {
      let h = Number(w);
      const next = tokens[i + 1]?.low ?? '';
      const extra: number[] = [];
      if (/^(утра)$/.test(next)) extra.push(i + 1);
      else if (/^(дня|вечера)$/.test(next)) { if (h < 12) h += 12; extra.push(i + 1); }
      else if (/^(ночи)$/.test(next)) { if (h === 12) h = 0; extra.push(i + 1); }
      else if (/^(час|часа|часов|ч)$/.test(next)) extra.push(i + 1);
      // Не путать с суммой: «в 15» без валюты после — это время
      if (h < 24 && !CURRENCY_RE.test(next)) {
        hints.time = `${String(h).padStart(2, '0')}:00`;
        use(i - 1, i, ...extra);
      }
    }
  }

  // ---- Сумма ----
  // Берём последнее «свободное» число (≥1). «кофе 250», «такси 350 руб», «+5000 зарплата»
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].used) continue;
    const w = tokens[i].low;
    const m = w.match(/^([+-]?)(\d+(?:[.,]\d{1,2})?)(к|k)?$/);
    if (!m) continue;
    let amount = Number(m[2].replace(',', '.'));
    if (m[3]) amount *= 1000;
    if (!(amount >= 1)) continue;
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    let currency: Currency | null = null;
    const markers: number[] = [];
    if (next && !next.used && currencyFromWord(next.low) && CURRENCY_RE.test(next.low)) { currency = currencyFromWord(next.low); markers.push(i + 1); }
    else if (prev && !prev.used && prev.low === '$') { currency = 'USD'; markers.push(i - 1); }
    hints.amount = amount;
    hints.currency = currency;
    hints.moneyKind = m[1] === '+' || INCOME_WORDS.test(text) ? 'income' : 'expense';
    use(i, ...markers);
    break;
  }

  const clean = tokens.filter((t) => !t.used).map((t) => t.raw).join(' ').replace(/\s+([,.!?])/g, '$1').trim();
  if (clean && clean !== text.trim()) hints.cleanText = clean.charAt(0).toUpperCase() + clean.slice(1);
  return hints;
}

function isTimePrefixed(tokens: Token[], i: number): boolean {
  return /^(в|во|к)$/.test(tokens[i - 1]?.low ?? '');
}

/** Есть ли вообще подсказки */
export function hasHints(h?: CaptureHints): boolean {
  return !!h && !!(h.date || h.time || h.amount);
}
