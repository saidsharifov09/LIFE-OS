// Действия над событиями календаря
import { db } from '@/db/db';
import type { CalendarEvent, DateStr, Recurrence, Task, TimeStr } from '@/db/types';
import { addDays, diffDays, occursOn, timeToMin, today } from '@/lib/dates';
import { PALETTE } from '@/lib/categories';
import { alive, insert, patch, runAction, softDelete } from './core';

export interface NewEvent {
  title: string;
  date: DateStr;
  start?: TimeStr | null;
  duration?: number;
  color?: string;
  notes?: string;
  recurrence?: Recurrence | null;
  taskId?: string | null;
  remind?: number[];
  demo?: boolean;
}

export function addEvent(input: NewEvent): Promise<CalendarEvent> {
  return runAction('Новое событие', () =>
    insert<CalendarEvent>('events', {
      title: input.title.trim() || 'Событие',
      date: input.date,
      start: input.start ?? null,
      duration: input.duration ?? 60,
      color: input.color ?? PALETTE[0],
      notes: input.notes ?? '',
      recurrence: input.recurrence ?? null,
      exdates: [],
      taskId: input.taskId ?? null,
      remind: input.remind ?? [15],
      demo: input.demo,
    }),
  );
}

export function updateEvent(id: string, changes: Partial<CalendarEvent>) {
  return runAction('Изменение события', () => patch<CalendarEvent>('events', id, changes));
}

/**
 * Перенести событие (например, перетаскиванием).
 * Для повторяющегося события переносится вся серия на ту же разницу дней.
 */
export function moveEvent(id: string, fromDate: DateStr, toDate: DateStr, start?: TimeStr | null) {
  return runAction('Перенос события', async () => {
    const ev = await db.events.get(id);
    if (!ev) return;
    const shift = diffDays(fromDate, toDate);
    return patch<CalendarEvent>('events', id, {
      date: addDays(ev.date, shift),
      ...(start !== undefined ? { start } : {}),
    });
  });
}

export function deleteEvent(id: string) {
  return runAction('Удаление события', () => softDelete('events', id));
}

/** Удалить только одно вхождение повторяющегося события */
export function skipOccurrence(id: string, date: DateStr) {
  return runAction('Пропуск повтора', async () => {
    const ev = await db.events.get(id);
    if (!ev) return;
    return patch<CalendarEvent>('events', id, { exdates: [...(ev.exdates ?? []), date] });
  });
}

/** Создать событие из задачи (и связать их) */
export function eventFromTask(taskId: string) {
  return runAction('Событие из задачи', async () => {
    const t = await db.tasks.get(taskId);
    if (!t) return;
    const ev = await insert<CalendarEvent>('events', {
      title: t.title, date: t.date ?? today(),
      start: t.time ?? '10:00', duration: 60, color: PALETTE[1], notes: t.notes ?? '',
      recurrence: null, exdates: [], taskId: t.id, remind: [15],
    });
    await patch<Task>('tasks', t.id, { eventId: ev.id });
    return ev;
  });
}

export interface Occurrence {
  event: CalendarEvent;
  date: DateStr;
}

/** Все вхождения событий в диапазоне дат [from, to] с учётом повторов */
export async function eventsInRange(from: DateStr, to: DateStr): Promise<Occurrence[]> {
  const all = (await db.events.toArray()).filter(alive);
  return expandEvents(all, from, to);
}

export function expandEvents(all: CalendarEvent[], from: DateStr, to: DateStr): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of all) {
    if (!ev.recurrence) {
      if (ev.date >= from && ev.date <= to) out.push({ event: ev, date: ev.date });
      continue;
    }
    if (ev.date > to) continue;
    for (let d = from < ev.date ? ev.date : from; d <= to; d = addDays(d, 1)) {
      if (occursOn(ev.date, ev.recurrence, d) && !ev.exdates?.includes(d)) out.push({ event: ev, date: d });
    }
  }
  return out.sort((a, b) =>
    a.date === b.date ? (a.event.start ? timeToMin(a.event.start) : -1) - (b.event.start ? timeToMin(b.event.start) : -1) : a.date < b.date ? -1 : 1,
  );
}
