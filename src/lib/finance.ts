// Чистые расчёты по финансам (без базы данных): остатки счетов, итоги месяца,
// разбивка по категориям, ряды для графиков, бюджеты, CSV. Покрыто тестами (finance.test.ts).
import type { Account, Budget, Currency, DateStr, Transaction } from '@/db/types';
import { addMonths, endOfMonth, fromDateStr, startOfMonth, MONTHS_NOM } from './dates';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, guessCategory } from './categories';

export type Rates = Record<Currency, number>;
export const CURRENCIES: Currency[] = ['RUB', 'TJS', 'USD'];
export const TOTAL_BUDGET = '__total';

/** Перевести сумму из одной валюты в другую через рубль */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return amount;
  return (amount * (rates[from] ?? 1)) / (rates[to] ?? 1);
}

export const toRub = (amount: number, cur: Currency, rates: Rates) => convert(amount, cur, 'RUB', rates);

/** Округление до копеек (чтобы не копить ошибки 0.1 + 0.2) */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Остатки счетов в их собственной валюте.
 * Расход/доход в другой валюте пересчитывается по курсу; перевод: со счёта списывается amount,
 * на счёт назначения приходит toAmount (если задан) или пересчёт по курсу.
 */
export function accountBalances(accounts: Account[], txs: Transaction[], rates: Rates): Map<string, number> {
  const res = new Map<string, number>();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const a of accounts) res.set(a.id, a.initialBalance);
  const add = (id: string | null | undefined, amount: number, cur: Currency) => {
    const acc = id ? byId.get(id) : undefined;
    if (!acc) return;
    res.set(acc.id, (res.get(acc.id) ?? 0) + convert(amount, cur, acc.currency, rates));
  };
  for (const t of txs) {
    if (t.type === 'income') add(t.accountId, t.amount, t.currency);
    else if (t.type === 'expense') add(t.accountId, -t.amount, t.currency);
    else {
      add(t.accountId, -t.amount, t.currency);
      const to = t.toAccountId ? byId.get(t.toAccountId) : undefined;
      if (to) {
        if (t.toAmount != null) res.set(to.id, (res.get(to.id) ?? 0) + t.toAmount);
        else add(to.id, t.amount, t.currency);
      }
    }
  }
  for (const [k, v] of res) res.set(k, round2(v));
  return res;
}

/** Общий остаток в рублях: счета + операции без счёта */
export function totalBalanceRub(accounts: Account[], txs: Transaction[], rates: Rates): number {
  const bal = accountBalances(accounts, txs, rates);
  const ids = new Set(accounts.map((a) => a.id));
  let total = 0;
  for (const a of accounts) total += toRub(bal.get(a.id) ?? 0, a.currency, rates);
  for (const t of txs) {
    if (t.accountId && ids.has(t.accountId)) continue;
    if (t.type === 'income') total += toRub(t.amount, t.currency, rates);
    if (t.type === 'expense') total -= toRub(t.amount, t.currency, rates);
  }
  return round2(total);
}

export function inRange(t: { date: DateStr }, from: DateStr, to: DateStr) {
  return t.date >= from && t.date <= to;
}

/** Доход/расход (в рублях) за период. Переводы не считаются */
export function totals(txs: Transaction[], from: DateStr, to: DateStr, rates: Rates) {
  let income = 0, expense = 0;
  for (const t of txs) {
    if (!inRange(t, from, to)) continue;
    if (t.type === 'income') income += toRub(t.amount, t.currency, rates);
    if (t.type === 'expense') expense += toRub(t.amount, t.currency, rates);
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

/** Сумма по категориям (в рублях), по убыванию */
export function byCategory(txs: Transaction[], from: DateStr, to: DateStr, rates: Rates, type: 'expense' | 'income' = 'expense') {
  const m = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== type || !inRange(t, from, to)) continue;
    const c = t.category ?? (type === 'expense' ? 'other' : 'other-in');
    m.set(c, (m.get(c) ?? 0) + toRub(t.amount, t.currency, rates));
  }
  return [...m.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

/** Доход/расход по месяцам: последние n месяцев, заканчивая месяцем даты `upTo` */
export function monthlySeries(txs: Transaction[], upTo: DateStr, n: number, rates: Rates) {
  const out: { month: string; label: string; income: number; expense: number }[] = [];
  const last = startOfMonth(upTo);
  for (let i = n - 1; i >= 0; i--) {
    const from = addMonths(last, -i);
    const t = totals(txs, from, endOfMonth(from), rates);
    out.push({ month: from.slice(0, 7), label: MONTHS_NOM[fromDateStr(from).getMonth()].slice(0, 3), income: t.income, expense: t.expense });
  }
  return out;
}

/** Накопленные траты по дням месяца: текущий месяц и прошлый (для сравнения темпа) */
export function cumulativeSpend(txs: Transaction[], monthDate: DateStr, rates: Rates, until?: DateStr) {
  const cur = startOfMonth(monthDate);
  const prev = addMonths(cur, -1);
  const daily = (from: DateStr) => {
    const days = Number(endOfMonth(from).slice(8));
    const arr = new Array(days).fill(0) as number[];
    for (const t of txs) {
      if (t.type !== 'expense' || !inRange(t, from, endOfMonth(from))) continue;
      arr[Number(t.date.slice(8)) - 1] += toRub(t.amount, t.currency, rates);
    }
    let s = 0;
    return arr.map((v) => round2((s += v)));
  };
  const a = daily(cur), b = daily(prev);
  const lastDay = until && until.slice(0, 7) === cur.slice(0, 7) ? Number(until.slice(8)) : a.length;
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({
    day: i + 1,
    current: i < lastDay && i < a.length ? a[i] : null,
    previous: i < b.length ? b[i] : null,
  }));
}

export interface BudgetState {
  budget: Budget;
  spent: number;
  percent: number;
  left: number;
  level: 'ok' | 'warn' | 'over';
}

/** Состояние бюджетов за месяц даты `day` */
export function budgetStates(budgets: Budget[], txs: Transaction[], day: DateStr, rates: Rates): BudgetState[] {
  const from = startOfMonth(day), to = endOfMonth(day);
  const cats = new Map(byCategory(txs, from, to, rates).map((c) => [c.category, c.amount]));
  const total = totals(txs, from, to, rates).expense;
  return budgets.map((b) => {
    const spent = b.category === TOTAL_BUDGET ? total : cats.get(b.category) ?? 0;
    const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0;
    return { budget: b, spent, percent, left: round2(b.amount - spent), level: percent > 100 ? 'over' : percent >= 80 ? 'warn' : 'ok' };
  });
}

// ---------------- Калькулятор быстрого ввода ----------------

/** Вычислить строку вида «250+120-30» (только + и −; запятая — десятичный разделитель) */
export function evalAmount(expr: string): number | null {
  const s = expr.replace(/\s/g, '').replace(/,/g, '.').replace(/−/g, '-');
  if (!s) return null;
  if (!/^[\d.+-]+$/.test(s)) return null;
  const parts = s.match(/[+-]?[^+-]+/g);
  if (!parts) return null;
  let sum = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    sum += n;
  }
  return round2(sum);
}

// ---------------- CSV ----------------

const TYPE_RU: Record<Transaction['type'], string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };
export const CSV_HEADER = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Категория', 'Счёт', 'Счёт назначения', 'Комментарий'];

function csvCell(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function categoryName(id: string | null | undefined, type: Transaction['type']): string {
  if (!id) return '';
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find((c) => c.id === id)?.name ?? id;
}

/** Экспорт операций в CSV (разделитель «;» — так Excel с русской локалью открывает без мастера) */
export function toCSV(txs: Transaction[], accounts: Account[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [
    t.date, TYPE_RU[t.type], String(t.amount).replace('.', ','), t.currency,
    t.type === 'transfer' ? '' : categoryName(t.category, t.type),
    (t.accountId && acc.get(t.accountId)) || '', (t.toAccountId && acc.get(t.toAccountId)) || '', t.note ?? '',
  ]);
  return '﻿' + [CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

/** Разбор CSV в строки (поддерживает кавычки, «;» или «,», переводы строк внутри кавычек) */
export function parseCSVRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export interface ImportedTx {
  type: Transaction['type'];
  amount: number;
  currency: Currency;
  category: string | null;
  date: DateStr;
  note: string;
  accountName: string;
  toAccountName: string;
}

const COLS: Record<keyof Omit<ImportedTx, 'category'> | 'category', RegExp> = {
  date: /^(дата|date)/i,
  type: /^(тип|type|вид)/i,
  amount: /^(сумма|amount|sum)/i,
  currency: /^(валюта|currency)/i,
  category: /^(категория|category)/i,
  toAccountName: /^(сч[её]т назначения|куда|to account)/i,
  accountName: /^(сч[её]т|account|карта)/i,
  note: /^(комментарий|описание|примечание|note|comment|description)/i,
};

function parseDate(s: string): DateStr | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseCurrency(s: string): Currency {
  const v = s.trim().toLowerCase();
  if (/usd|\$|доллар/.test(v)) return 'USD';
  if (/tjs|смн|сомони/.test(v)) return 'TJS';
  return 'RUB';
}

function parseCategory(name: string, type: 'expense' | 'income', note: string): string {
  const v = name.trim().toLowerCase();
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const found = list.find((c) => c.name.toLowerCase() === v || c.id === v);
  return found ? found.id : guessCategory(`${name} ${note}`, type);
}

/** Импорт CSV: возвращает распознанные операции и число пропущенных строк */
export function fromCSV(text: string): { items: ImportedTx[]; skipped: number } {
  const rows = parseCSVRows(text);
  if (!rows.length) return { items: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim());
  const idx: Partial<Record<keyof ImportedTx, number>> = {};
  for (const key of ['date', 'type', 'amount', 'currency', 'category', 'toAccountName', 'accountName', 'note'] as const) {
    const i = header.findIndex((h, j) => COLS[key].test(h) && !Object.values(idx).includes(j));
    if (i >= 0) idx[key] = i;
  }
  if (idx.date === undefined || idx.amount === undefined) return { items: [], skipped: rows.length - 1 };
  const items: ImportedTx[] = [];
  let skipped = 0;
  const num = (v: string) => Number(v.replace(/[\s\u00a0₽$]|смн|руб\.?/gi, '').replace(',', '.'));
  // Без типа: если в файле есть отрицательные суммы — знак решает (минус — расход), иначе всё — расходы
  const signMode = rows.slice(1).some((r) => num(r[idx.amount!] ?? '') < 0);
  for (const r of rows.slice(1)) {
    const get = (k: keyof ImportedTx) => (idx[k] !== undefined ? (r[idx[k]!] ?? '').trim() : '');
    const date = parseDate(get('date'));
    const rawAmount = Number(get('amount').replace(/[\s ₽$]|смн|руб\.?/gi, '').replace(',', '.'));
    if (!date || !Number.isFinite(rawAmount) || rawAmount === 0) { skipped++; continue; }
    const typeStr = get('type').toLowerCase();
    const type: Transaction['type'] =
      /перев|transfer/.test(typeStr) ? 'transfer' : /доход|income|приход|поступ/.test(typeStr) ? 'income' : /расход|expense|списан|трат/.test(typeStr) ? 'expense'
        : signMode && rawAmount > 0 ? 'income' : 'expense';
    const note = get('note');
    items.push({
      type,
      amount: Math.abs(rawAmount),
      currency: get('currency') ? parseCurrency(get('currency')) : 'RUB',
      category: type === 'transfer' ? null : parseCategory(get('category'), type, note),
      date,
      note,
      accountName: get('accountName'),
      toAccountName: get('toAccountName'),
    });
  }
  return { items, skipped };
}

/** Ключ для поиска дублей при повторном импорте */
export function txKey(t: { date: DateStr; type: string; amount: number; currency: string; note?: string }) {
  return `${t.date}|${t.type}|${round2(t.amount)}|${t.currency}|${(t.note ?? '').trim().toLowerCase()}`;
}
