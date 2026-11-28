import { describe, expect, it } from 'vitest';
import { bestStreak, currentStreak, goalProgress, isScheduled, periodStats } from './habits';
import { addDays } from './dates';

const T = '2026-11-27'; // пятница
const h = (days: number[] = [], target = 1) => ({ days, target, createdAt: 0 });
const map = (entries: [string, number][]) => new Map(entries);

describe('привычки', () => {
  it('расписание по дням недели', () => {
    expect(isScheduled(h(), T)).toBe(true);
    expect(isScheduled(h([4]), T)).toBe(true); // пятница = 4
    expect(isScheduled(h([0, 2]), T)).toBe(false);
  });

  it('серия: сегодня ещё не отмечено — серия не рвётся; пропуск — рвётся', () => {
    const m = map([[addDays(T, -1), 1], [addDays(T, -2), 1], [addDays(T, -3), 1], [addDays(T, -5), 1]]);
    expect(currentStreak(h(), m, T)).toBe(3);
    m.set(T, 1);
    expect(currentStreak(h(), m, T)).toBe(4);
    expect(bestStreak(h(), m)).toBe(4);
  });

  it('выходные дни привычки не рвут серию', () => {
    // пн, ср, пт: отмечены пт(-7), пн(-4), ср(-2) и пт (сегодня)
    const m = map([[addDays(T, -7), 1], [addDays(T, -4), 1], [addDays(T, -2), 1], [T, 1]]);
    expect(currentStreak(h([0, 2, 4]), m, T)).toBe(4);
  });

  it('несколько раз в день: засчитывается только при достижении цели', () => {
    const m = map([[T, 1], [addDays(T, -1), 2]]);
    expect(currentStreak(h([], 2), m, T)).toBe(1);
    expect(periodStats(h([], 2), m, addDays(T, -1), T)).toEqual({ done: 1, planned: 2, percent: 50 });
  });

  it('статистика за неделю', () => {
    const m = map([[T, 1], [addDays(T, -1), 1], [addDays(T, -3), 1]]);
    expect(periodStats(h(), m, addDays(T, -6), T)).toEqual({ done: 3, planned: 7, percent: 43 });
  });
});

describe('цели', () => {
  it('прогресс по этапам или вручную', () => {
    const ms = (n: number, done: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), title: '', done: i < done }));
    expect(goalProgress({ milestones: ms(4, 1), progress: 0, done: false })).toBe(25);
    expect(goalProgress({ milestones: [], progress: 40, done: false })).toBe(40);
    expect(goalProgress({ milestones: ms(4, 1), progress: 0, done: true })).toBe(100);
  });
});
