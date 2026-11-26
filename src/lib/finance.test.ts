import { describe, expect, it } from 'vitest';
import type { Account, Budget, Transaction } from '@/db/types';
import {
  accountBalances, budgetStates, byCategory, cumulativeSpend, evalAmount, fromCSV, monthlySeries, toCSV, totalBalanceRub, totals,
} from './finance';

const rates = { RUB: 1, TJS: 8.5, USD: 92 };
const base = { createdAt: 0, updatedAt: 0 };
const acc = (id: string, currency: Account['currency'], initialBalance: number, name = id): Account =>
  ({ ...base, id, name, kind: 'card', currency, initialBalance });
let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction =>
  ({ ...base, id: `t${n++}`, currency: 'RUB', date: '2026-11-10', category: 'food', accountId: 'a', ...t });

describe('finance', () => {
  it('остатки счетов, переводы и валюты', () => {
    const accounts = [acc('a', 'RUB', 1000), acc('b', 'USD', 10)];
    const txs = [
      tx({ type: 'expense', amount: 200 }),
      tx({ type: 'income', amount: 500 }),
      tx({ type: 'transfer', amount: 920, accountId: 'a', toAccountId: 'b' }),
      tx({ type: 'transfer', amount: 1, currency: 'USD', accountId: 'b', toAccountId: 'a', toAmount: 90 }),
      tx({ type: 'expense', amount: 2, currency: 'USD', accountId: 'b' }),
    ];
    const bal = accountBalances(accounts, txs, rates);
    expect(bal.get('a')).toBe(1000 - 200 + 500 - 920 + 90);
    expect(bal.get('b')).toBe(10 + 10 - 1 - 2);
    expect(totalBalanceRub(accounts, txs, rates)).toBe(470 + 17 * 92);
  });

  it('операции без счёта входят в общий остаток', () => {
    expect(totalBalanceRub([], [tx({ type: 'expense', amount: 100, accountId: null })], rates)).toBe(-100);
  });

  it('итоги и категории (переводы не считаются)', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, category: 'cafe' }),
      tx({ type: 'expense', amount: 1, currency: 'USD', category: 'food' }),
      tx({ type: 'income', amount: 1000, category: 'salary' }),
      tx({ type: 'transfer', amount: 500, toAccountId: 'b' }),
      tx({ type: 'expense', amount: 999, date: '2026-10-31' }),
    ];
    expect(totals(txs, '2026-11-01', '2026-11-30', rates)).toEqual({ income: 1000, expense: 192, net: 808 });
    expect(byCategory(txs, '2026-11-01', '2026-11-30', rates)).toEqual([{ category: 'food', amount: 92 }, { category: 'cafe', amount: 100 }].sort((a, b) => b.amount - a.amount));
    const series = monthlySeries(txs, '2026-11-26', 3, rates);
    expect(series.map((s) => s.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(series[1].expense).toBe(999);
  });

  it('накопленные траты по дням', () => {
    const txs = [tx({ type: 'expense', amount: 10, date: '2026-11-02' }), tx({ type: 'expense', amount: 5, date: '2026-11-04' }), tx({ type: 'expense', amount: 7, date: '2026-10-01' })];
    const c = cumulativeSpend(txs, '2026-11-15', rates, '2026-11-05');
    expect(c).toHaveLength(31);
    expect(c[0]).toEqual({ day: 1, current: 0, previous: 7 });
    expect(c[3].current).toBe(15);
    expect(c[5].current).toBeNull();
    expect(c[30].current).toBeNull();
  });

  it('бюджеты: предупреждение и превышение', () => {
    const budgets: Budget[] = [
      { ...base, id: 'b1', category: 'cafe', amount: 100 },
      { ...base, id: 'b2', category: 'food', amount: 1000 },
      { ...base, id: 'b3', category: '__total', amount: 1000 },
    ];
    const txs = [tx({ type: 'expense', amount: 120, category: 'cafe' }), tx({ type: 'expense', amount: 850, category: 'food' })];
    const s = budgetStates(budgets, txs, '2026-11-26', rates);
    expect(s.map((x) => x.level)).toEqual(['over', 'warn', 'warn']);
    expect(s[0].left).toBe(-20);
  });

  it('калькулятор суммы', () => {
    expect(evalAmount('250')).toBe(250);
    expect(evalAmount('250+120-30')).toBe(340);
    expect(evalAmount('99,5+0,5')).toBe(100);
    expect(evalAmount('')).toBeNull();
    expect(evalAmount('2*3')).toBeNull();
  });

  it('CSV: экспорт → импорт без потерь', () => {
    const accounts = [acc('a', 'RUB', 0, 'Карта'), acc('b', 'RUB', 0, 'Наличные')];
    const txs = [
      tx({ type: 'expense', amount: 250.5, category: 'cafe', note: 'Кофе; с «пенкой»', date: '2026-11-01' }),
      tx({ type: 'income', amount: 80000, category: 'salary', note: 'Зарплата', date: '2026-11-05' }),
      tx({ type: 'transfer', amount: 1000, toAccountId: 'b', category: null, date: '2026-11-06' }),
    ];
    const csv = toCSV(txs, accounts);
    expect(csv.startsWith('﻿Дата;Тип')).toBe(true);
    const { items, skipped } = fromCSV(csv);
    expect(skipped).toBe(0);
    expect(items).toEqual([
      { type: 'expense', amount: 250.5, currency: 'RUB', category: 'cafe', date: '2026-11-01', note: 'Кофе; с «пенкой»', accountName: 'Карта', toAccountName: '' },
      { type: 'income', amount: 80000, currency: 'RUB', category: 'salary', date: '2026-11-05', note: 'Зарплата', accountName: 'Карта', toAccountName: '' },
      { type: 'transfer', amount: 1000, currency: 'RUB', category: null, date: '2026-11-06', note: '', accountName: 'Карта', toAccountName: 'Наличные' },
    ]);
  });

  it('CSV: чужой формат (запятые, знак суммы, дата ДД.ММ.ГГГГ)', () => {
    const { items, skipped } = fromCSV('Date,Amount,Description\n05.11.2026,-350,Такси домой\n06.11.2026,5000,Подработка\nмусор,abc,x\n');
    expect(skipped).toBe(1);
    expect(items[0]).toMatchObject({ type: 'expense', amount: 350, date: '2026-11-05', category: 'transport' });
    expect(items[1]).toMatchObject({ type: 'income', amount: 5000, category: 'side' });
  });

  it('CSV: без типа и без минусов — всё расходы', () => {
    const { items } = fromCSV('Дата;Сумма;Комментарий\n2026-11-01;250;кофе\n');
    expect(items[0]).toMatchObject({ type: 'expense', category: 'cafe' });
  });
});
