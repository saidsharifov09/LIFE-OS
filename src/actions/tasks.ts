// Действия над задачами
import { db } from '@/db/db';
import type { DateStr, Priority, Recurrence, Subtask, Task, TimeStr } from '@/db/types';
import { nextOccurrence, today } from '@/lib/dates';
import { uid } from '@/lib/id';
import { alive, insert, patch, runAction, softDelete } from './core';

export interface NewTask {
  title: string;
  notes?: string;
  date?: DateStr | null;
  time?: TimeStr | null;
  priority?: Priority;
  category?: string | null;
  subtasks?: string[] | Subtask[];
  recurrence?: Recurrence | null;
  demo?: boolean;
}

/** Добавить задачу */
export function addTask(input: NewTask): Promise<Task> {
  return runAction('Новая задача', () =>
    insert<Task>('tasks', {
      title: input.title.trim() || 'Без названия',
      notes: input.notes ?? '',
      date: input.date ?? null,
      time: input.time ?? null,
      priority: input.priority ?? 0,
      category: input.category ?? null,
      subtasks: (input.subtasks ?? []).map((s) => (typeof s === 'string' ? { id: uid(), title: s, done: false } : s)),
      done: false,
      doneAt: null,
      recurrence: input.recurrence ?? null,
      topDate: null,
      demo: input.demo,
    }),
  );
}

/** Изменить задачу */
export function updateTask(id: string, changes: Partial<Task>) {
  return runAction('Изменение задачи', () => patch<Task>('tasks', id, changes));
}

/**
 * Отметить выполнение. Для повторяющейся задачи при выполнении
 * создаётся следующий экземпляр на следующую дату повторения.
 */
export function completeTask(id: string, done = true) {
  return runAction(done ? 'Задача выполнена' : 'Задача возвращена', async () => {
    const task = await db.tasks.get(id);
    if (!task) return undefined;
    const updated = await patch<Task>('tasks', id, { done, doneAt: done ? Date.now() : null });
    if (done && task.recurrence && task.date && !task.done) {
      const next = nextOccurrence(task.date, task.recurrence, task.date);
      if (next) {
        await insert<Task>('tasks', {
          ...stripBase(task),
          date: next,
          done: false,
          doneAt: null,
          topDate: null,
          subtasks: task.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
        });
      }
      // У выполненного экземпляра убираем повтор, чтобы не плодить дубли при повторном переключении
      await patch<Task>('tasks', id, { recurrence: null });
    }
    return updated;
  });
}

/** Перенести задачу на дату (null — без даты) */
export function moveTask(id: string, date: DateStr | null, time?: TimeStr | null) {
  return runAction('Перенос задачи', () =>
    patch<Task>('tasks', id, { date, ...(time !== undefined ? { time } : {}) }),
  );
}

/** Перенести все невыполненные задачи с датой ≤ from на дату to */
export function moveUnfinished(from: DateStr, to: DateStr) {
  return runAction('Перенос невыполненного', async () => {
    const list = (await db.tasks.toArray()).filter((t) => alive(t) && !t.done && t.date && t.date <= from);
    for (const t of list) await patch<Task>('tasks', t.id, { date: to });
    return list.length;
  });
}

export function deleteTask(id: string) {
  return runAction('Удаление задачи', () => softDelete('tasks', id));
}

export function toggleSubtask(taskId: string, subId: string) {
  return runAction('Подзадача', async () => {
    const t = await db.tasks.get(taskId);
    if (!t) return;
    return patch<Task>('tasks', taskId, {
      subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)),
    });
  });
}

/** Отметить/снять задачу как один из 3 главных приоритетов дня */
export function setTop(id: string, date: DateStr | null = today()) {
  return runAction('Главный приоритет', () => patch<Task>('tasks', id, { topDate: date }));
}

/** Все живые задачи */
export async function listTasks(): Promise<Task[]> {
  return (await db.tasks.toArray()).filter(alive);
}

function stripBase(t: Task) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = t;
  return rest;
}
