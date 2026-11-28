// Расчёты раздела «Люди»: ближайший день рождения, возраст, «давно не общались». Без БД — легко тестировать.
import type { DateStr, Person } from '@/db/types';
import { diffDays, fromDateStr, MONTHS_GEN } from './dates';

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Дата дня рождения в году y. 29 февраля в невисокосный год — 28 февраля */
export function birthdayInYear(mmdd: string, y: number): DateStr {
  const md = mmdd === '02-29' && !isLeap(y) ? '02-28' : mmdd;
  return `${y}-${md}`;
}

/** Корректная ли строка «MM-DD» */
export function validMmdd(mmdd: string | null | undefined): mmdd is string {
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return false;
  const [m, d] = mmdd.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export interface BirthdayInfo {
  /** Дата ближайшего дня рождения (сегодня или позже) */
  date: DateStr;
  /** Через сколько дней (0 — сегодня) */
  daysLeft: number;
  /** Сколько исполнится (если известен год) */
  age: number | null;
}

export function nextBirthday(p: Pick<Person, 'birthday' | 'birthYear'>, base: DateStr): BirthdayInfo | null {
  if (!validMmdd(p.birthday)) return null;
  const y = Number(base.slice(0, 4));
  let date = birthdayInYear(p.birthday, y);
  if (date < base) date = birthdayInYear(p.birthday, y + 1);
  const age = p.birthYear ? Number(date.slice(0, 4)) - p.birthYear : null;
  return { date, daysLeft: diffDays(base, date), age: age !== null && age >= 0 && age < 150 ? age : null };
}

/** «5 декабря» из «12-05» */
export function fmtBirthday(mmdd: string, year?: number | null): string {
  const d = fromDateStr(`2000-${mmdd}`);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year ? ` ${year}` : ''}`;
}

/** Сколько дней прошло с последнего контакта (null — не отмечали) */
export function daysSinceContact(p: Pick<Person, 'lastContact'>, base: DateStr): number | null {
  return p.lastContact ? Math.max(0, diffDays(p.lastContact, base)) : null;
}

/** Пора связаться: задан интервал и он прошёл (или контакт ни разу не отмечен) */
export function contactDue(p: Pick<Person, 'lastContact' | 'contactEvery'>, base: DateStr): boolean {
  if (!p.contactEvery || p.contactEvery <= 0) return false;
  const since = daysSinceContact(p, base);
  return since === null || since >= p.contactEvery;
}

/** «сегодня», «вчера», «5 дней назад» */
export function fmtSince(days: number | null): string {
  if (days === null) return 'не отмечено';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  const a = days % 100, b = days % 10;
  const w = a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b > 1 && b < 5 ? 'дня' : 'дней';
  return `${days} ${w} назад`;
}
