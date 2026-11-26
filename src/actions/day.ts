// Сводка дня — используется на главной, в обзорах и (позже) в ИИ-чате: «что у меня завтра?»
import { db } from '@/db/db';
import type { DateStr, Task } from '@/db/types';
import { addDays, startOfWeek, timeToMin, today } from '@/lib/dates';
import { alive } from './core';
import { eventsInRange, type Occurrence } from './events';
import { moneySummary } from './money';

export interface DayView {
  date: DateStr;
  /** Задачи на этот день (включая выполненные в этот день) */
  tasks: Task[];
  /** Просроченные невыполненные (только для сегодняшнего дня) */
  overdue: Task[];
  /** До 3 главных приоритетов */
  top: Task[];
  events: Occurrence[];
  /** Процент выполнения задач дня */
  progress: { done: number; total: number; percent: number };
  money: Awaited<ReturnType<typeof moneySummary>>;
}

export function sortTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if ((a.date ?? '9999') !== (b.date ?? '9999')) return (a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1;
  const ta = a.time ? timeToMin(a.time) : 9999, tb = b.time ? timeToMin(b.time) : 9999;
  if (ta !== tb) return ta - tb;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.createdAt - b.createdAt;
}

/** Всё о дне: задачи, события, прогресс, деньги */
export async function getDay(date: DateStr = today()): Promise<DayView> {
  const all = (await db.tasks.toArray()).filter(alive);
  const isToday = date === today();
  const tasks = all.filter((t) => t.date === date).sort(sortTasks);
  const overdue = isToday ? all.filter((t) => !t.done && t.date && t.date < date).sort(sortTasks) : [];
  const top = all.filter((t) => t.topDate === date).sort(sortTasks).slice(0, 3);
  const events = await eventsInRange(date, date);
  const relevant = [...tasks, ...overdue];
  const done = relevant.filter((t) => t.done).length;
  const total = relevant.length;
  return {
    date, tasks, overdue, top, events,
    progress: { done, total, percent: total ? Math.round((done / total) * 100) : 0 },
    money: await moneySummary(date),
  };
}

/** Группы задач для раздела «Задачи» */
export type TaskBucket = 'today' | 'tomorrow' | 'week' | 'future' | 'nodate' | 'overdue' | 'done';

export function bucketOf(t: Task, base: DateStr = today()): TaskBucket {
  if (t.done) return 'done';
  if (!t.date) return 'nodate';
  if (t.date < base) return 'overdue';
  if (t.date === base) return 'today';
  if (t.date === addDays(base, 1)) return 'tomorrow';
  if (t.date <= addDays(startOfWeek(base), 6)) return 'week';
  return 'future';
}
