// Работа с датами без сторонних библиотек. Все даты — локальные строки YYYY-MM-DD.
import type { DateStr, Recurrence, TimeStr } from '@/db/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromDateStr(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function today(): DateStr {
  return toDateStr(new Date());
}
export function addDays(s: DateStr, n: number): DateStr {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function addMonths(s: DateStr, n: number): DateStr {
  const d = fromDateStr(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateStr(d);
}
/** Разница в днях b - a */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((fromDateStr(b).getTime() - fromDateStr(a).getTime()) / 86400000);
}
/** День недели 0..6, где 0 — понедельник */
export function weekday(s: DateStr): number {
  return (fromDateStr(s).getDay() + 6) % 7;
}
export function startOfWeek(s: DateStr): DateStr {
  return addDays(s, -weekday(s));
}
export function startOfMonth(s: DateStr): DateStr {
  return s.slice(0, 8) + '01';
}
export function endOfMonth(s: DateStr): DateStr {
  return addDays(addMonths(startOfMonth(s), 1), -1);
}
export function nowTime(): TimeStr {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function timeToMin(t: TimeStr): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function minToTime(min: number): TimeStr {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** «26 ноября» */
export function fmtDay(s: DateStr): string {
  const d = fromDateStr(s);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}
/** «Четверг, 26 ноября» */
export function fmtDayLong(s: DateStr): string {
  const w = WEEKDAYS_FULL[weekday(s)];
  return `${w[0].toUpperCase()}${w.slice(1)}, ${fmtDay(s)}`;
}
/** Относительная подпись: Сегодня / Завтра / Вчера / Пт, 28 ноября */
export function fmtRelative(s: DateStr, base: DateStr = today()): string {
  const diff = diffDays(base, s);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === 2) return 'Послезавтра';
  if (diff === -1) return 'Вчера';
  const sameYear = s.slice(0, 4) === base.slice(0, 4);
  return `${WEEKDAYS_SHORT[weekday(s)]}, ${fmtDay(s)}${sameYear ? '' : ' ' + s.slice(0, 4)}`;
}

/** Попадает ли дата на повторение (start — дата первого вхождения) */
export function occursOn(start: DateStr, rec: Recurrence | null | undefined, day: DateStr): boolean {
  if (!rec) return day === start;
  if (day < start) return false;
  if (rec.until && day > rec.until) return false;
  const iv = Math.max(1, rec.interval || 1);
  switch (rec.freq) {
    case 'daily':
      return diffDays(start, day) % iv === 0;
    case 'weekly': {
      const weeks = Math.floor(diffDays(startOfWeek(start), startOfWeek(day)) / 7);
      if (weeks % iv !== 0) return false;
      const days = rec.days && rec.days.length ? rec.days : [weekday(start)];
      return days.includes(weekday(day));
    }
    case 'monthly': {
      const a = fromDateStr(start), b = fromDateStr(day);
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      if (months % iv !== 0) return false;
      return addMonths(start, months) === day;
    }
    case 'yearly':
      return start.slice(5) === day.slice(5) && (Number(day.slice(0, 4)) - Number(start.slice(0, 4))) % iv === 0;
  }
}

/** Следующая дата повторения строго после `after` */
export function nextOccurrence(start: DateStr, rec: Recurrence, after: DateStr): DateStr | null {
  let d = addDays(after > start ? after : start, 1);
  for (let i = 0; i < 800; i++) {
    if (rec.until && d > rec.until) return null;
    if (occursOn(start, rec, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}

export function describeRecurrence(rec: Recurrence | null | undefined): string {
  if (!rec) return 'Не повторять';
  const iv = rec.interval || 1;
  switch (rec.freq) {
    case 'daily': return iv === 1 ? 'Каждый день' : `Каждые ${iv} дн.`;
    case 'weekly': {
      if (iv === 1 && rec.days?.length === 5 && [0, 1, 2, 3, 4].every((d) => rec.days!.includes(d))) return 'По будням';
      const days = rec.days?.length ? rec.days.map((d) => WEEKDAYS_SHORT[d]).join(', ') : '';
      const base = iv === 1 ? 'Каждую неделю' : `Каждые ${iv} нед.`;
      return days ? `${base}: ${days}` : base;
    }
    case 'monthly': return iv === 1 ? 'Каждый месяц' : `Каждые ${iv} мес.`;
    case 'yearly': return 'Каждый год';
  }
}
