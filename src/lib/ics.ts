// Файлы .ics (iCalendar, RFC 5545) — «Добавить в Календарь iPhone».
// Календарь iPhone сам напомнит в нужный момент, даже когда Life OS закрыт.
import type { DateStr, Recurrence, TimeStr } from '@/db/types';
import { addDays, timeToMin } from './dates';

export interface IcsItem {
  uid: string;
  title: string;
  description?: string;
  date: DateStr;
  /** null — на весь день */
  start?: TimeStr | null;
  /** Минуты (для событий со временем) */
  duration?: number;
  recurrence?: Recurrence | null;
  exdates?: DateStr[];
  /**
   * Напоминания: смещение в минутах относительно начала (отрицательное — заранее).
   * Для событий «на весь день» начало — полночь, поэтому «в 9:00 в тот же день» = +540,
   * «за день в 9:00» = −900.
   */
  alarms?: number[];
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Перенос длинных строк: не длиннее 75 байт (UTF-8), продолжение начинается с пробела */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // у продолжений первый байт — пробел
    if (bytes + b > limit) { parts.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const d8 = (d: DateStr) => d.replace(/-/g, '');

function dateTime(date: DateStr, minutes: number) {
  const day = addDays(date, Math.floor(minutes / 1440));
  const m = ((minutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${d8(day)}T${hh}${mm}00`;
}

/** Длительность в формате ICS: -P1DT15H, PT9H, -PT15M */
export function icsDuration(min: number): string {
  if (min === 0) return 'PT0M';
  const sign = min < 0 ? '-' : '';
  let m = Math.abs(min);
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  let s = `${sign}P${d ? `${d}D` : ''}`;
  if (h || m) s += `T${h ? `${h}H` : ''}${m ? `${m}M` : ''}`;
  return s;
}

export function rrule(r: Recurrence, start: DateStr): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if ((r.interval || 1) > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly') {
    const days = r.days?.length ? r.days : null;
    if (days) parts.push(`BYDAY=${[...days].sort().map((d) => BYDAY[d]).join(',')}`);
  }
  // Приложение переносит «31-е» на последний день короткого месяца — в календаре так же
  if (r.freq === 'monthly' && Number(start.slice(8)) === 31) parts.push('BYMONTHDAY=-1');
  if (r.until) parts.push(`UNTIL=${d8(r.until)}T235959`);
  return parts.join(';');
}

/** Собрать файл .ics из одного или нескольких пунктов */
export function buildICS(items: IcsItem[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life OS//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const it of items) {
    L.push('BEGIN:VEVENT', `UID:${it.uid}@life-os`, `DTSTAMP:${dtstamp}`, `SUMMARY:${esc(it.title)}`);
    if (it.start) {
      // «Плавающее» локальное время — календарь покажет его в поясе устройства
      const s = timeToMin(it.start);
      L.push(`DTSTART:${dateTime(it.date, s)}`, `DTEND:${dateTime(it.date, s + Math.max(it.duration ?? 30, 1))}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${d8(it.date)}`, `DTEND;VALUE=DATE:${d8(addDays(it.date, 1))}`, 'TRANSP:TRANSPARENT');
    }
    if (it.recurrence) L.push(`RRULE:${rrule(it.recurrence, it.date)}`);
    for (const ex of it.exdates ?? []) {
      L.push(it.start ? `EXDATE:${dateTime(ex, timeToMin(it.start))}` : `EXDATE;VALUE=DATE:${d8(ex)}`);
    }
    if (it.description) L.push(`DESCRIPTION:${esc(it.description)}`);
    for (const a of [...new Set(it.alarms ?? [])].sort((x, y) => x - y)) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title)}`, `TRIGGER:${icsDuration(a)}`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

// ---------- Готовые варианты напоминаний ----------

export interface AlarmOption { value: number; label: string }

/** Для дел со временем: за сколько минут до начала */
export const TIMED_ALARMS: AlarmOption[] = [
  { value: 0, label: 'В момент' },
  { value: -5, label: 'За 5 мин' },
  { value: -15, label: 'За 15 мин' },
  { value: -30, label: 'За 30 мин' },
  { value: -60, label: 'За 1 час' },
  { value: -120, label: 'За 2 часа' },
  { value: -1440, label: 'За день' },
];

/** Для дел на весь день (платежи, дни рождения): относительно полуночи */
export const ALLDAY_ALARMS: AlarmOption[] = [
  { value: 9 * 60, label: 'В день, 9:00' },
  { value: 19 * 60 - 1440, label: 'Накануне, 19:00' },
  { value: 9 * 60 - 1440, label: 'За день, 9:00' },
  { value: 9 * 60 - 3 * 1440, label: 'За 3 дня' },
  { value: 9 * 60 - 7 * 1440, label: 'За неделю' },
];

/** День рождения: ежегодное событие на весь день (для раздела «Люди», Этап 6) */
export function birthdayItem(p: { id: string; name: string; date: DateStr }, alarms = [9 * 60, 9 * 60 - 1440]): IcsItem {
  return {
    uid: `bday-${p.id}`, title: `🎂 День рождения: ${p.name}`, date: p.date, start: null,
    recurrence: { freq: 'yearly', interval: 1 }, alarms,
  };
}

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Имя файла латиницей (некоторые браузеры теряют кириллицу в имени загрузки) */
export function icsFileName(title: string) {
  const lat = [...title.toLowerCase()].map((c) => TR[c] ?? c).join('');
  const base = lat.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'life-os';
  return `${base}.ics`;
}
