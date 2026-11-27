// Действия над финансами: счета, операции, переводы, бюджеты, регулярные платежи, долги, копилки, курсы, импорт.
// Всё через runAction — любое действие можно отменить из тоста.
import { db } from '@/db/db';
import type {
  Account, Budget, Currency, DateStr, Debt, Recurrence, RecurringPayment, SavingsGoal, Transaction,
} from '@/db/types';
import { guessCategory } from '@/lib/categories';
import { endOfMonth, nextOccurrence, occursOn, startOfMonth, today } from '@/lib/dates';
import {
  accountBalances, budgetStates, round2, totalBalanceRub, totals, txKey, type ImportedTx, type Rates,
} from '@/lib/finance';
import { alive, insert, patch, runAction, softDelete } from './core';

// ---------- Операции ----------
export interface NewMoney {
  amount: number;
  currency?: Currency;
  category?: string | null;
  date?: DateStr;
  note?: string;
  accountId?: string | null;
  recurringId?: string | null;
  demo?: boolean;
}

export function addExpense(input: NewMoney) {
  return runAction('Расход', () => insertMoney('expense', input));
}

export function addIncome(input: NewMoney) {
  return runAction('Доход', () => insertMoney('income', input));
}

async function insertMoney(type: 'expense' | 'income', input: NewMoney) {
  const accountId = input.accountId === undefined ? await defaultAccountId() : input.accountId;
  // Валюта по умолчанию — валюта счёта
  const acc = accountId ? await db.accounts.get(accountId) : undefined;
  return insert<Transaction>('transactions', {
    type,
    amount: round2(Math.abs(input.amount)),
    currency: input.currency ?? acc?.currency ?? 'RUB',
    category: input.category ?? guessCategory(input.note ?? '', type),
    date: input.date ?? today(),
    note: input.note ?? '',
    accountId,
    toAccountId: null,
    recurringId: input.recurringId ?? null,
    demo: input.demo,
  });
}

/** Перевод между счетами. toAmount — сколько пришло, если валюты разные (иначе по курсу) */
export function addTransfer(input: { fromId: string; toId: string; amount: number; toAmount?: number | null; date?: DateStr; note?: string; demo?: boolean }) {
  return runAction('Перевод', async () => {
    const from = await db.accounts.get(input.fromId);
    return insert<Transaction>('transactions', {
      type: 'transfer',
      amount: round2(Math.abs(input.amount)),
      currency: from?.currency ?? 'RUB',
      accountId: input.fromId,
      toAccountId: input.toId,
      toAmount: input.toAmount != null ? round2(input.toAmount) : null,
      category: null,
      date: input.date ?? today(),
      note: input.note ?? '',
      demo: input.demo,
    });
  });
}

export function updateTransaction(id: string, changes: Partial<Transaction>) {
  return runAction('Изменение операции', () => patch<Transaction>('transactions', id, changes));
}

export function deleteTransaction(id: string) {
  return runAction('Удаление операции', async () => {
    const t = await db.transactions.get(id);
    // Перевод в копилку/из копилки — откатываем сумму копилки
    if (t?.savingsId) {
      const g = await db.savings.get(t.savingsId);
      if (g) await patch<SavingsGoal>('savings', g.id, { saved: round2(g.saved + (t.toAccountId ? t.amount : -t.amount)) });
    }
    return softDelete('transactions', id);
  });
}

export async function listTransactions(): Promise<Transaction[]> {
  return (await db.transactions.toArray()).filter(alive).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

// ---------- Счета ----------
export function addAccount(input: Pick<Account, 'name' | 'kind' | 'currency' | 'initialBalance'> & { color?: string; demo?: boolean }) {
  return runAction('Новый счёт', () => insert<Account>('accounts', { ...input, archived: false }));
}

export function updateAccount(id: string, changes: Partial<Account>) {
  return runAction('Изменение счёта', () => patch<Account>('accounts', id, changes));
}

/** Удалить счёт. Операции остаются (без счёта) — история не теряется */
export function deleteAccount(id: string) {
  return runAction('Удаление счёта', () => softDelete('accounts', id));
}

export async function listAccounts(includeArchived = false): Promise<Account[]> {
  return (await db.accounts.toArray()).filter((a) => alive(a) && (includeArchived || !a.archived)).sort((a, b) => a.createdAt - b.createdAt);
}

async function defaultAccountId(): Promise<string | null> {
  const preferred = await db.settings.get('defaultAccount');
  const acc = await listAccounts();
  if (preferred?.value && acc.some((a) => a.id === preferred.value)) return preferred.value as string;
  return acc[0]?.id ?? null;
}

// ---------- Курсы ----------
/** Курсы к рублю по умолчанию — меняются вручную в «Финансы → Настройки» */
export const DEFAULT_RATES: Rates = { RUB: 1, TJS: 8.5, USD: 92 };

export async function getRates(): Promise<Rates> {
  const s = await db.settings.get('rates');
  return { ...DEFAULT_RATES, ...((s?.value as Rates) ?? {}), RUB: 1 };
}

export async function setRates(rates: Partial<Rates>) {
  const cur = await getRates();
  await db.settings.put({ key: 'rates', value: { ...cur, ...rates, RUB: 1 }, updatedAt: Date.now() });
}

// ---------- Бюджеты ----------
/** Задать бюджет категории на месяц (amount ≤ 0 — убрать) */
export function setBudget(category: string, amount: number, demo?: boolean) {
  return runAction('Бюджет', async () => {
    const existing = (await db.budgets.where('category').equals(category).toArray()).filter(alive)[0];
    if (amount <= 0) return existing ? softDelete('budgets', existing.id) : undefined;
    if (existing) return patch<Budget>('budgets', existing.id, { amount: round2(amount) });
    return insert<Budget>('budgets', { category, amount: round2(amount), demo });
  });
}

export async function listBudgets(): Promise<Budget[]> {
  return (await db.budgets.toArray()).filter(alive);
}

// ---------- Регулярные платежи и подписки ----------
export interface NewRecurring {
  title: string;
  amount: number;
  kind?: 'expense' | 'income';
  currency?: Currency;
  category?: string | null;
  accountId?: string | null;
  startDate: DateStr;
  recurrence: Recurrence;
  subscription?: boolean;
  demo?: boolean;
}

/** Первая дата повтора, начиная с `from` включительно */
function firstOnOrAfter(start: DateStr, rec: Recurrence, from: DateStr): DateStr | null {
  if (from <= start) return start;
  if (occursOn(start, rec, from)) return from;
  return nextOccurrence(start, rec, from);
}

export function addRecurring(input: NewRecurring) {
  return runAction('Регулярный платёж', () => {
    const kind = input.kind ?? 'expense';
    return insert<RecurringPayment>('recurring', {
      title: input.title,
      kind,
      amount: round2(Math.abs(input.amount)),
      currency: input.currency ?? 'RUB',
      category: input.category ?? guessCategory(input.title, kind),
      accountId: input.accountId ?? null,
      startDate: input.startDate,
      recurrence: input.recurrence,
      nextDate: input.startDate,
      subscription: input.subscription ?? false,
      active: true,
      demo: input.demo,
    });
  });
}

export function updateRecurring(id: string, changes: Partial<RecurringPayment>) {
  return runAction('Изменение платежа', async () => {
    const cur = await db.recurring.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...changes };
    // Сменили расписание — пересчитать ближайшую дату от сегодняшнего дня
    if (changes.startDate || changes.recurrence) {
      changes = { ...changes, nextDate: firstOnOrAfter(next.startDate, next.recurrence, today() < next.startDate ? next.startDate : today()) };
    }
    return patch<RecurringPayment>('recurring', id, changes);
  });
}

export function deleteRecurring(id: string) {
  return runAction('Удаление платежа', () => softDelete('recurring', id));
}

/** Отметить платёж оплаченным: создаётся операция, ближайшая дата сдвигается на следующую */
export function payRecurring(id: string, opts: { date?: DateStr; amount?: number; accountId?: string | null } = {}) {
  return runAction('Оплата', async () => {
    const r = await db.recurring.get(id);
    if (!r || !r.nextDate) return undefined;
    const input: NewMoney = {
      amount: opts.amount ?? r.amount,
      currency: r.currency,
      category: r.category,
      date: opts.date ?? today(),
      note: r.title,
      accountId: opts.accountId !== undefined ? opts.accountId : r.accountId ?? undefined,
      recurringId: r.id,
    };
    const tx = await insertMoney(r.kind, input);
    await patch<RecurringPayment>('recurring', id, { nextDate: nextOccurrence(r.startDate, r.recurrence, r.nextDate) });
    return tx;
  });
}

/** Пропустить ближайшее списание (без операции) */
export function skipRecurring(id: string) {
  return runAction('Пропуск платежа', async () => {
    const r = await db.recurring.get(id);
    if (!r || !r.nextDate) return undefined;
    return patch<RecurringPayment>('recurring', id, { nextDate: nextOccurrence(r.startDate, r.recurrence, r.nextDate) });
  });
}

export async function listRecurring(): Promise<RecurringPayment[]> {
  return (await db.recurring.toArray()).filter(alive).sort((a, b) => (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999'));
}

/** Сумма регулярных расходов в месяц (в рублях) — грубо, по частоте */
export function monthlyCost(r: RecurringPayment, rates: Rates): number {
  const iv = Math.max(1, r.recurrence.interval || 1);
  const perMonth = { daily: 30 / iv, weekly: ((r.recurrence.days?.length || 1) * 52) / 12 / iv, monthly: 1 / iv, yearly: 1 / 12 / iv }[r.recurrence.freq];
  return round2(r.amount * (rates[r.currency] ?? 1) * perMonth);
}

// ---------- Долги ----------
export function addDebt(input: { person: string; direction: Debt['direction']; amount: number; currency?: Currency; due?: DateStr | null; note?: string; demo?: boolean }) {
  return runAction('Долг', () => insert<Debt>('debts', {
    person: input.person, direction: input.direction, amount: round2(Math.abs(input.amount)), currency: input.currency ?? 'RUB',
    paid: 0, due: input.due ?? null, note: input.note ?? '', closed: false, demo: input.demo,
  }));
}

export function updateDebt(id: string, changes: Partial<Debt>) {
  return runAction('Изменение долга', () => patch<Debt>('debts', id, changes));
}

/** Частичный или полный возврат долга. Полностью вернули — долг закрывается */
export function repayDebt(id: string, amount: number) {
  return runAction('Возврат долга', async () => {
    const d = await db.debts.get(id);
    if (!d) return undefined;
    const paid = Math.min(d.amount, round2(d.paid + Math.abs(amount)));
    return patch<Debt>('debts', id, { paid, closed: paid >= d.amount });
  });
}

export function deleteDebt(id: string) {
  return runAction('Удаление долга', () => softDelete('debts', id));
}

export async function listDebts(): Promise<Debt[]> {
  return (await db.debts.toArray()).filter(alive).sort((a, b) => Number(a.closed) - Number(b.closed) || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
}

// ---------- Копилки ----------
export function addSavings(input: { name: string; target: number; currency?: Currency; deadline?: DateStr | null; color?: string; saved?: number; demo?: boolean }) {
  return runAction('Новая копилка', () => insert<SavingsGoal>('savings', {
    name: input.name, target: round2(Math.abs(input.target)), currency: input.currency ?? 'RUB', saved: round2(input.saved ?? 0),
    deadline: input.deadline ?? null, color: input.color ?? '#2dd4bf', closed: false, demo: input.demo,
  }));
}

export function updateSavings(id: string, changes: Partial<SavingsGoal>) {
  return runAction('Изменение копилки', () => patch<SavingsGoal>('savings', id, changes));
}

export function deleteSavings(id: string) {
  return runAction('Удаление копилки', () => softDelete('savings', id));
}

/**
 * Положить в копилку (amount > 0) или забрать (amount < 0).
 * Если указан счёт — создаётся перевод (деньги уходят со счёта / возвращаются на счёт),
 * в аналитике расходов это не учитывается.
 */
export function moveSavings(id: string, amount: number, accountId?: string | null) {
  return runAction(amount >= 0 ? 'В копилку' : 'Из копилки', async () => {
    const g = await db.savings.get(id);
    if (!g || !amount) return undefined;
    const abs = round2(Math.abs(amount));
    if (accountId) {
      await insert<Transaction>('transactions', {
        type: 'transfer', amount: abs, currency: g.currency,
        accountId: amount > 0 ? accountId : null, toAccountId: amount > 0 ? null : accountId,
        savingsId: g.id, category: null, date: today(), note: `${amount > 0 ? 'В копилку' : 'Из копилки'} «${g.name}»`,
      });
    }
    return patch<SavingsGoal>('savings', id, { saved: Math.max(0, round2(g.saved + amount)) });
  });
}

export async function listSavings(): Promise<SavingsGoal[]> {
  return (await db.savings.toArray()).filter(alive).sort((a, b) => Number(a.closed ?? false) - Number(b.closed ?? false) || a.createdAt - b.createdAt);
}

// ---------- Импорт ----------
/** Импортировать операции из CSV. Дубли (та же дата, тип, сумма, валюта, комментарий) пропускаются */
export function importTransactions(items: ImportedTx[]) {
  return runAction('Импорт CSV', async () => {
    const existing = new Set((await listTransactions()).map(txKey));
    const accounts = await listAccounts(true);
    const findAcc = (name: string) => accounts.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());
    let added = 0, dup = 0;
    for (const it of items) {
      const key = txKey(it);
      if (existing.has(key)) { dup++; continue; }
      existing.add(key);
      let acc = it.accountName ? findAcc(it.accountName) : undefined;
      if (it.accountName && !acc) {
        acc = await insert<Account>('accounts', { name: it.accountName, kind: 'card', currency: it.currency, initialBalance: 0, archived: false });
        accounts.push(acc);
      }
      let to = it.toAccountName ? findAcc(it.toAccountName) : undefined;
      if (it.type === 'transfer' && it.toAccountName && !to) {
        to = await insert<Account>('accounts', { name: it.toAccountName, kind: 'card', currency: it.currency, initialBalance: 0, archived: false });
        accounts.push(to);
      }
      await insert<Transaction>('transactions', {
        type: it.type, amount: it.amount, currency: it.currency, category: it.category, date: it.date, note: it.note,
        accountId: acc?.id ?? (await defaultAccountId()), toAccountId: it.type === 'transfer' ? to?.id ?? null : null,
      });
      added++;
    }
    return { added, dup };
  });
}

// ---------- Сводки ----------
/** Всё, что нужно экранам финансов, одним запросом */
export async function financeData() {
  const [rates, accounts, allAccounts, txs, budgets] = await Promise.all([getRates(), listAccounts(), listAccounts(true), listTransactions(), listBudgets()]);
  const balances = accountBalances(allAccounts, txs, rates);
  return { rates, accounts, allAccounts, txs, budgets, balances };
}

/** Сводка по деньгам для главной: остаток, траты сегодня и за месяц (в рублях), счета и бюджет месяца */
export async function moneySummary(day: DateStr = today()) {
  const rates = await getRates();
  const txs = (await db.transactions.toArray()).filter(alive);
  const allAccounts = await listAccounts(true);
  const accounts = allAccounts.filter((a) => !a.archived);
  const budgets = await listBudgets();
  const balances = accountBalances(allAccounts, txs, rates);
  const month = totals(txs, startOfMonth(day), day, rates);
  const todayT = totals(txs, day, day, rates);
  const states = budgetStates(budgets, txs, day, rates);
  const total = states.find((s) => s.budget.category === '__total');
  const catBudgets = states.filter((s) => s.budget.category !== '__total');
  // Бюджет месяца: общий, если задан, иначе сумма бюджетов по категориям
  const monthBudget = total
    ? { amount: total.budget.amount, spent: total.spent }
    : catBudgets.length ? { amount: catBudgets.reduce((s, b) => s + b.budget.amount, 0), spent: catBudgets.reduce((s, b) => s + b.spent, 0) } : null;
  const upcoming = (await listRecurring()).filter((r) => r.active && r.nextDate && r.nextDate <= endOfMonth(day));
  return {
    balance: totalBalanceRub(allAccounts, txs, rates),
    spentToday: todayT.expense,
    spentMonth: month.expense,
    incomeMonth: month.income,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, balance: balances.get(a.id) ?? 0 })),
    monthBudget,
    overBudget: states.filter((s) => s.level === 'over').map((s) => s.budget.category),
    upcoming: upcoming.slice(0, 3).map((r) => ({ id: r.id, title: r.title, amount: r.amount, currency: r.currency, date: r.nextDate! })),
    hasAccounts: accounts.length > 0,
    hasData: txs.length > 0 || accounts.length > 0,
  };
}
