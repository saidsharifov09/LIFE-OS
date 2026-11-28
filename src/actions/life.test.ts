import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  addGoal, addHabit, addWater, addWorkout, checkHabit, getHealth, habitChecks, lifeToday, listGoals, setHealth,
  toggleMilestone, undoLast, workoutsRange, lastWeight,
} from './index';
import { addDays, today } from '@/lib/dates';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('привычки', () => {
  it('отметка: +1 до цели, повторное касание снимает; одна запись на день; отмена', async () => {
    const h = await addHabit({ title: 'Зубы', emoji: '🪥', target: 2 });
    expect(await checkHabit(h.id)).toBe(1);
    expect(await checkHabit(h.id)).toBe(2);
    expect(await checkHabit(h.id)).toBe(0);
    expect(await db.habitChecks.count()).toBe(1);
    await checkHabit(h.id);
    await undoLast();
    expect((await habitChecks())[0].count).toBe(0);
  });

  it('«на сегодня» учитывает дни недели', async () => {
    const wd = (new Date().getDay() + 6) % 7;
    await addHabit({ title: 'Каждый день' });
    await addHabit({ title: 'Не сегодня', days: [(wd + 1) % 7] });
    const t = await lifeToday();
    expect(t.habits.map((x) => x.habit.title)).toEqual(['Каждый день']);
  });
});

describe('цели', () => {
  it('все этапы выполнены → цель достигнута', async () => {
    const g = await addGoal({ title: 'Выучить английский', milestones: ['A1', 'A2'] });
    await toggleMilestone(g.id, g.milestones[0].id);
    expect((await db.goals.get(g.id))?.done).toBe(false);
    const after = await toggleMilestone(g.id, g.milestones[1].id);
    expect(after?.done).toBe(true);
    expect((await listGoals())[0].done).toBe(true);
  });
});

describe('здоровье', () => {
  it('день хранится одной записью, поля дополняются', async () => {
    await setHealth(today(), { sleep: 7.5 });
    await addWater(1);
    await addWater(1);
    await setHealth(today(), { mood: 4 });
    const d = await getHealth();
    expect(d).toMatchObject({ sleep: 7.5, water: 2, mood: 4 });
    expect(await db.health.count()).toBe(1);
    await addWater(-5);
    expect((await getHealth())?.water).toBe(0);
  });

  it('последний вес и тренировки', async () => {
    await setHealth(addDays(today(), -3), { weight: 72.4 });
    await setHealth(addDays(today(), -1), { sleep: 8 });
    expect(await lastWeight()).toEqual({ date: addDays(today(), -3), weight: 72.4 });
    await addWorkout({ kind: 'Бег', minutes: 30 });
    expect((await workoutsRange(addDays(today(), -7), today()))[0]).toMatchObject({ kind: 'Бег', minutes: 30 });
  });
});
