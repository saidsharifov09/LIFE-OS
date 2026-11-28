// Расчёты для целей, привычек и здоровья — чистые функции без базы (с тестами).
import type { DateStr, Goal, Habit, HabitCheck } from '@/db/types';
import { addDays, diffDays, weekday } from './dates';

/** Нужно ли выполнять привычку в этот день */
export function isScheduled(h: Pick<Habit, 'days'>, date: DateStr): boolean {
  return !h.days.length || h.days.includes(weekday(date));
}

/** Карта отметок привычки: дата → сколько раз */
export function checkMap(checks: HabitCheck[]): Map<DateStr, number> {
  const m = new Map<DateStr, number>();
  for (const c of checks) if (!c.deletedAt) m.set(c.date, c.count);
  return m;
}

const doneOn = (h: Pick<Habit, 'target'>, m: Map<DateStr, number>, d: DateStr) => (m.get(d) ?? 0) >= Math.max(1, h.target);

/**
 * Текущая серия: сколько запланированных дней подряд выполнено.
 * Сегодня ещё не выполнено — серия не прерывается (день не закончился).
 * Незапланированные дни (выходной у привычки) серию не рвут.
 */
export function currentStreak(h: Pick<Habit, 'days' | 'target' | 'createdAt'>, m: Map<DateStr, number>, today: DateStr): number {
  let n = 0;
  let d = today;
  if (isScheduled(h, d) && !doneOn(h, m, d)) d = addDays(d, -1);
  for (let i = 0; i < 1000; i++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) {
      if (!h.days.length) break;
      continue;
    }
    if (!doneOn(h, m, d)) break;
    n++;
  }
  return n;
}

/** Лучшая серия за всё время */
export function bestStreak(h: Pick<Habit, 'days' | 'target'>, m: Map<DateStr, number>): number {
  const dates = [...m.keys()].filter((d) => doneOn(h, m, d)).sort();
  if (!dates.length) return 0;
  let best = 0, cur = 0;
  let d = dates[0];
  const last = dates[dates.length - 1];
  for (let i = 0; i < 5000 && d <= last; i++, d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    if (doneOn(h, m, d)) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

export interface PeriodStats { done: number; planned: number; percent: number }

/** Выполнено из запланированного за период [from, to] (to включительно) */
export function periodStats(h: Pick<Habit, 'days' | 'target' | 'createdAt'>, m: Map<DateStr, number>, from: DateStr, to: DateStr): PeriodStats {
  let done = 0, planned = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    planned++;
    if (doneOn(h, m, d)) done++;
  }
  return { done, planned, percent: planned ? Math.round((done / planned) * 100) : 0 };
}

/** Прогресс цели 0–100: по этапам, если они есть, иначе ручной */
export function goalProgress(g: Pick<Goal, 'milestones' | 'progress' | 'done'>): number {
  if (g.done) return 100;
  if (g.milestones.length) return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
  return Math.max(0, Math.min(100, Math.round(g.progress)));
}

/** Сколько дней до срока (отрицательное — просрочено) */
export function daysLeft(deadline: DateStr | null | undefined, today: DateStr): number | null {
  return deadline ? diffDays(today, deadline) : null;
}

/** Слово «день/дня/дней» для серий */
export const DAYS_FORMS: [string, string, string] = ['день', 'дня', 'дней'];

export const WATER_GOAL = 8;
export const SLEEP_GOAL = 8;
