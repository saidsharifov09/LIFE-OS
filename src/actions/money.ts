// Действия над финансами (базовые; полный модуль — Этап 3)
import { db } from '@/db/db';
import type { Account, Currency, DateStr, Transaction } from '@/db/types';
import { guessCategory } from '@/lib/categories';
import { startOfMonth, today } from '@/lib/dates';
import { alive, insert, patch, runAction, softDelete } from './core';

export interface NewMoney {
  amount: number;
  currency?: Currency;
  category?: string | null;
  date?: DateStr;
  note?: string;
  accountId?: string | null;
  demo?: boolean;
}

export function addExpense(input: NewMoney) {
  return runAction('Расход', () => insertMoney('expense', input));
}

export function addIncome(input: NewMoney) {
  return runAction('Доход', () => insertMoney('income', input));
}

async function insertMoney(type: 'expense' | 'income', input: NewMoney) {
  return insert<Transaction>('transactions', {
    type,
    amount: Math.abs(input.amount),
    currency: input.currency ?? 'RUB',
    category: input.category ?? guessCategory(input.note ?? '', type),
    date: input.date ?? today(),
    note: input.note ?? '',
    accountId: input.accountId ?? (await defaultAccountId()),
    toAccountId: null,
    demo: input.demo,
  });
}

export function updateTransaction(id: string, changes: Partial<Transaction>) {
  return runAction('Изменение операции', () => patch<Transaction>('transactions', id, changes));
}

export function deleteTransaction(id: string) {
  return runAction('Удаление операции', () => softDelete('transactions', id));
}

export function addAccount(input: Pick<Account, 'name' | 'kind' | 'currency' | 'initialBalance'> & { demo?: boolean }) {
  return runAction('Новый счёт', () => insert<Account>('accounts', { ...input, archived: false }));
}

async function defaultAccountId(): Promise<string | null> {
  const acc = (await db.accounts.toArray()).filter((a) => alive(a) && !a.archived);
  return acc[0]?.id ?? null;
}

/** Курсы к рублю (задаются вручную в настройках, Этап 3/7) */
export const DEFAULT_RATES: Record<Currency, number> = { RUB: 1, TJS: 8.5, USD: 92 };

export async function getRates(): Promise<Record<Currency, number>> {
  const s = await db.settings.get('rates');
  return { ...DEFAULT_RATES, ...((s?.value as Record<Currency, number>) ?? {}) };
}

/** Сводка по деньгам для главной: остаток, траты сегодня и за месяц (в рублях) */
export async function moneySummary(day: DateStr = today()) {
  const rates = await getRates();
  const tx = (await db.transactions.toArray()).filter(alive);
  const acc = (await db.accounts.toArray()).filter(alive);
  const rub = (t: { amount: number; currency: Currency }) => t.amount * (rates[t.currency] ?? 1);
  const month = startOfMonth(day);
  let spentToday = 0, spentMonth = 0, incomeMonth = 0;
  for (const t of tx) {
    if (t.type === 'expense' && t.date === day) spentToday += rub(t);
    if (t.type === 'expense' && t.date >= month && t.date <= day) spentMonth += rub(t);
    if (t.type === 'income' && t.date >= month && t.date <= day) incomeMonth += rub(t);
  }
  let balance = acc.reduce((s, a) => s + a.initialBalance * (rates[a.currency] ?? 1), 0);
  for (const t of tx) {
    if (t.type === 'income') balance += rub(t);
    if (t.type === 'expense') balance -= rub(t);
  }
  return { balance, spentToday, spentMonth, incomeMonth, hasAccounts: acc.length > 0, hasData: tx.length > 0 || acc.length > 0 };
}
