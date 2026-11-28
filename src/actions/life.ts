// Действия: цели, привычки, здоровье, тренировки (Этап 5)
import { db } from '@/db/db';
import type { BaseRecord, DateStr, Goal, Habit, HabitCheck, HealthDay, Milestone, Workout } from '@/db/types';
import { PALETTE } from '@/lib/categories';
import { today } from '@/lib/dates';
import { uid } from '@/lib/id';
import { goalProgress, isScheduled } from '@/lib/habits';
import { alive, insert, patch, now, runAction, softDelete } from './core';

// ---------- Цели ----------

export function addGoal(input: { title: string; why?: string; deadline?: DateStr | null; color?: string; emoji?: string; milestones?: string[]; progress?: number; demo?: boolean }) {
  return runAction('Новая цель', () =>
    insert<Goal>('goals', {
      title: input.title.trim(), why: input.why?.trim() || undefined, deadline: input.deadline ?? null,
      color: input.color ?? PALETTE[0], emoji: input.emoji,
      milestones: (input.milestones ?? []).filter((m) => m.trim()).map((t) => ({ id: uid(), title: t.trim(), done: false })),
      progress: input.progress ?? 0, done: false, demo: input.demo,
    }),
  );
}

export function updateGoal(id: string, changes: Partial<Goal>) {
  return runAction('Изменение цели', () => patch<Goal>('goals', id, changes));
}

/** Отметить этап. Если все этапы выполнены — цель достигнута. Возвращает цель после изменения. */
export function toggleMilestone(goalId: string, milestoneId: string) {
  return runAction('Этап цели', async () => {
    const g = await db.goals.get(goalId);
    if (!g) return undefined;
    const milestones: Milestone[] = g.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m));
    const all = milestones.length > 0 && milestones.every((m) => m.done);
    return patch<Goal>('goals', goalId, { milestones, done: all, doneAt: all ? now() : null });
  });
}

export function completeGoal(id: string, done = true) {
  return runAction(done ? 'Цель достигнута' : 'Цель снова в работе', () => patch<Goal>('goals', id, { done, doneAt: done ? now() : null }));
}

export function deleteGoal(id: string) {
  return runAction('Удаление цели', () => softDelete('goals', id));
}

export async function listGoals(): Promise<Goal[]> {
  const all = (await db.goals.toArray()).filter(alive).filter((g) => !g.archived);
  // Сначала активные (ближайший срок выше), потом достигнутые
  return all.sort((a, b) => Number(a.done) - Number(b.done) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.createdAt - b.createdAt);
}

export { goalProgress };

// ---------- Привычки ----------

export function addHabit(input: { title: string; emoji?: string; color?: string; days?: number[]; target?: number; goalId?: string | null; demo?: boolean }) {
  return runAction('Новая привычка', async () => {
    const order = (await db.habits.toArray()).filter(alive).length;
    return insert<Habit>('habits', {
      title: input.title.trim(), emoji: input.emoji ?? '✅', color: input.color ?? PALETTE[1],
      days: input.days ?? [], target: Math.max(1, input.target ?? 1), goalId: input.goalId ?? null, order, demo: input.demo,
    });
  });
}

export function updateHabit(id: string, changes: Partial<Habit>) {
  return runAction('Изменение привычки', () => patch<Habit>('habits', id, changes));
}

export function deleteHabit(id: string) {
  return runAction('Удаление привычки', () => softDelete('habits', id));
}

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  return (await db.habits.toArray()).filter(alive).filter((h) => includeArchived || !h.archived).sort((a, b) => a.order - b.order);
}

/** Переставить привычку на позицию (порядок в списке) */
export function moveHabit(id: string, dir: -1 | 1) {
  return runAction('Порядок привычек', async () => {
    const list = await listHabits();
    const i = list.findIndex((h) => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) await patch<Habit>('habits', list[k].id, { order: k });
  });
}

const checkId = (habitId: string, date: DateStr) => `${habitId}_${date}`;

/**
 * Отметить привычку за день. По умолчанию: +1 раз; если цель дня уже выполнена — сброс в 0 (повторное касание снимает отметку).
 * Возвращает новое число отметок.
 */
export function checkHabit(habitId: string, date: DateStr = today(), count?: number) {
  return runAction('Отметка привычки', async () => {
    const h = await db.habits.get(habitId);
    if (!h) return 0;
    const id = checkId(habitId, date);
    const cur = await db.habitChecks.get(id);
    const was = cur && !cur.deletedAt ? cur.count : 0;
    const next = count ?? (was >= h.target ? 0 : was + 1);
    if (cur) await patch<HabitCheck>('habitChecks', id, { count: next, deletedAt: null });
    else await insert<HabitCheck>('habitChecks', { id, habitId, date, count: next, demo: h.demo });
    return next;
  });
}

export async function habitChecks(from?: DateStr, to?: DateStr): Promise<HabitCheck[]> {
  const q = from && to ? db.habitChecks.where('date').between(from, to, true, true) : db.habitChecks.toCollection();
  return (await q.toArray()).filter(alive);
}

// ---------- Здоровье ----------

const dayId = (date: DateStr) => `day_${date}`;

export async function getHealth(date: DateStr = today()): Promise<HealthDay | undefined> {
  const d = await db.health.get(dayId(date));
  return d && !d.deletedAt ? d : undefined;
}

/** Записать показатели дня (только переданные поля) */
export function setHealth(date: DateStr, changes: Partial<Omit<HealthDay, keyof BaseRecord | 'date'>>, demo?: boolean) {
  return runAction('Здоровье', async () => {
    const id = dayId(date);
    const cur = await db.health.get(id);
    if (cur) return patch<HealthDay>('health', id, { ...changes, deletedAt: null });
    return insert<HealthDay>('health', { id, date, ...changes, demo });
  });
}

/** +1 / −1 стакан воды */
export function addWater(delta: number, date: DateStr = today()) {
  return runAction(delta > 0 ? 'Стакан воды' : 'Вода', async () => {
    const cur = await getHealth(date);
    const water = Math.max(0, (cur?.water ?? 0) + delta);
    await setHealth(date, { water });
    return water;
  });
}

export async function healthRange(from: DateStr, to: DateStr): Promise<HealthDay[]> {
  return (await db.health.where('date').between(from, to, true, true).toArray()).filter(alive).sort((a, b) => a.date.localeCompare(b.date));
}

/** Последний записанный вес (до даты включительно) */
export async function lastWeight(before: DateStr = today()): Promise<{ date: DateStr; weight: number } | null> {
  const all = (await db.health.where('date').belowOrEqual(before).toArray()).filter(alive).filter((d) => d.weight).sort((a, b) => b.date.localeCompare(a.date));
  return all[0] ? { date: all[0].date, weight: all[0].weight! } : null;
}

export function addWorkout(input: { kind: string; minutes: number; date?: DateStr; note?: string; demo?: boolean }) {
  return runAction('Тренировка', () =>
    insert<Workout>('workouts', { kind: input.kind.trim() || 'Тренировка', minutes: Math.max(1, Math.round(input.minutes)), date: input.date ?? today(), note: input.note, demo: input.demo }),
  );
}

export function deleteWorkout(id: string) {
  return runAction('Удаление тренировки', () => softDelete('workouts', id));
}

export async function workoutsRange(from: DateStr, to: DateStr): Promise<Workout[]> {
  return (await db.workouts.where('date').between(from, to, true, true).toArray()).filter(alive).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** Сводка для главной и ИИ: привычки на день, вода, сон, настроение */
export async function lifeToday(date: DateStr = today()) {
  const habits = (await listHabits()).filter((h) => isScheduled(h, date));
  const checks = await habitChecks(date, date);
  const counts = new Map(checks.map((c) => [c.habitId, c.count]));
  return {
    habits: habits.map((h) => ({ habit: h, count: counts.get(h.id) ?? 0, done: (counts.get(h.id) ?? 0) >= h.target })),
    health: await getHealth(date),
  };
}

