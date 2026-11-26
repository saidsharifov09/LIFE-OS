import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  addTask, completeTask, capture, processInbox, undoLast, getDay, moveUnfinished,
  addEvent, eventsInRange, moveEvent, addExpense, moneySummary, listTasks,
} from './index';
import { addDays, today } from '@/lib/dates';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('actions', () => {
  it('захват → задача с подсказками', async () => {
    const item = await capture('позвонить маме завтра в 18:00');
    await processInbox(item.id, 'task');
    const tasks = await listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Позвонить маме');
    expect(tasks[0].date).toBe(addDays(today(), 1));
    expect(tasks[0].time).toBe('18:00');
    expect((await db.inbox.get(item.id))?.processed).toBe(true);
  });

  it('захват → расход и отмена', async () => {
    const item = await capture('кофе 250');
    await processInbox(item.id, 'expense');
    let s = await moneySummary();
    expect(s.spentToday).toBe(250);
    const tx = await db.transactions.toArray();
    expect(tx[0].category).toBe('cafe');
    await undoLast();
    s = await moneySummary();
    expect(s.spentToday).toBe(0);
    expect((await db.inbox.get(item.id))?.processed).toBe(false);
  });

  it('повторяющаяся задача создаёт следующую', async () => {
    const t = await addTask({ title: 'Зарядка', date: today(), recurrence: { freq: 'daily', interval: 1 } });
    await completeTask(t.id);
    const tasks = await listTasks();
    expect(tasks).toHaveLength(2);
    const next = tasks.find((x) => !x.done)!;
    expect(next.date).toBe(addDays(today(), 1));
    expect(next.recurrence?.freq).toBe('daily');
    // повторное переключение не плодит дубли
    await completeTask(t.id, false);
    await completeTask(t.id, true);
    expect(await listTasks()).toHaveLength(2);
  });

  it('getDay: прогресс и просроченные', async () => {
    await addTask({ title: 'A', date: today() });
    const b = await addTask({ title: 'B', date: today() });
    await addTask({ title: 'C', date: addDays(today(), -2) });
    await completeTask(b.id);
    const d = await getDay();
    expect(d.tasks).toHaveLength(2);
    expect(d.overdue).toHaveLength(1);
    expect(d.progress.percent).toBe(33);
  });

  it('перенос невыполненного', async () => {
    await addTask({ title: 'A', date: today() });
    await addTask({ title: 'B', date: addDays(today(), -3) });
    const n = await moveUnfinished(today(), addDays(today(), 1));
    expect(n).toBe(2);
    expect((await listTasks()).every((t) => t.date === addDays(today(), 1))).toBe(true);
  });

  it('повторяющиеся события и перенос', async () => {
    const ev = await addEvent({ title: 'Спорт', date: '2026-11-23', start: '08:00', recurrence: { freq: 'weekly', interval: 1, days: [0, 2] } });
    const occ = await eventsInRange('2026-11-23', '2026-12-06');
    expect(occ.map((o) => o.date)).toEqual(['2026-11-23', '2026-11-25', '2026-11-30', '2026-12-02']);
    await moveEvent(ev.id, '2026-11-23', '2026-11-24', '09:00');
    const e2 = await db.events.get(ev.id);
    expect(e2?.date).toBe('2026-11-24');
    expect(e2?.start).toBe('09:00');
  });

  it('доход и расход в сводке', async () => {
    await addExpense({ amount: 100, currency: 'USD', note: 'x' });
    const s = await moneySummary();
    expect(s.spentToday).toBe(9200);
  });
});
