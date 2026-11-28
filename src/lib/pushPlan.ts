// Расписание push-напоминаний на ближайшие дни — то же, что напоминания внутри приложения
// (src/modules/calendar/reminders.ts): события за N минут до начала и задачи со временем.
// Чистая функция: на сервер уходит только этот список. По умолчанию без названий дел — только время.
import type { CalendarEvent, DateStr, Task } from '@/db/types';
import { addDays, fromDateStr } from './dates';
import { expandEvents } from '@/actions/events';

export interface PushItem {
  /** Постоянный id: событие/задача + дата (+ минуты до) — сервер не пришлёт одно и то же дважды */
  id: string;
  /** Когда прислать (ISO, UTC) */
  fireAt: string;
  title: string;
  body: string;
  /** Куда открыть приложение по нажатию */
  url: string;
}

export const PUSH_DAYS = 14;
export const PUSH_MAX = 300;

/** Локальная дата + время → момент (учитывает часовой пояс устройства) */
export function localMoment(date: DateStr, time: string, minusMin = 0): Date {
  const d = fromDateStr(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m - minusMin, 0, 0);
  return d;
}

export function planPush(
  events: CalendarEvent[], tasks: Task[],
  opts: { now?: Date; days?: number; showTitles?: boolean } = {},
): PushItem[] {
  const now = opts.now ?? new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const to = addDays(from, (opts.days ?? PUSH_DAYS) - 1);
  const show = !!opts.showTitles;
  const out: PushItem[] = [];

  for (const { event, date } of expandEvents(events.filter((e) => !e.deletedAt), from, to)) {
    if (!event.start) continue;
    for (const before of event.remind?.length ? event.remind : [0]) {
      const at = localMoment(date, event.start, before);
      if (at <= now) continue;
      const when = before ? `через ${before} мин, в ${event.start}` : `сейчас, ${event.start}`;
      out.push({
        id: `e:${event.id}:${date}:${before}`,
        fireAt: at.toISOString(),
        title: show ? event.title : 'Life OS',
        body: show ? `Событие ${when}` : `⏰ Событие ${when}`,
        url: `#/calendar?date=${date}&open=${event.id}`,
      });
    }
  }
  for (const t of tasks) {
    if (t.deletedAt || t.done || !t.date || !t.time || t.date < from || t.date > to) continue;
    const at = localMoment(t.date, t.time);
    if (at <= now) continue;
    out.push({
      id: `t:${t.id}:${t.date}`,
      fireAt: at.toISOString(),
      title: show ? t.title : 'Life OS',
      body: show ? `Пора, ${t.time}` : `⏰ Задача на ${t.time}`,
      url: `#/tasks?open=${t.id}`,
    });
  }
  return out.sort((a, b) => a.fireAt.localeCompare(b.fireAt)).slice(0, PUSH_MAX);
}
