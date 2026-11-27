import { describe, expect, it } from 'vitest';
import { birthdayItem, buildICS, icsDuration, icsFileName, rrule } from './ics';

const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('ics', () => {
  it('событие со временем и напоминаниями', () => {
    const s = buildICS([{ uid: 'e1', title: 'Встреча, важная; с Али', date: '2026-12-05', start: '15:00', duration: 90, alarms: [-15, 0] }], new Date('2026-11-27T10:00:00Z'));
    expect(s).toContain('BEGIN:VCALENDAR\r\n');
    expect(s).toContain('DTSTART:20261205T150000\r\n');
    expect(s).toContain('DTEND:20261205T163000\r\n');
    expect(s).toContain('SUMMARY:Встреча\\, важная\\; с Али');
    expect(s).toContain('TRIGGER:-PT15M');
    expect(s).toContain('TRIGGER:PT0M');
    expect(s).toContain('DTSTAMP:20261127T100000Z');
    expect(s.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(s.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('весь день, повтор и исключения', () => {
    const s = buildICS([{
      uid: 'p', title: 'Аренда', date: '2026-01-31', start: null,
      recurrence: { freq: 'monthly', interval: 1 }, exdates: ['2026-02-28'], alarms: [540, -900],
    }]);
    expect(s).toContain('DTSTART;VALUE=DATE:20260131');
    expect(s).toContain('DTEND;VALUE=DATE:20260201');
    expect(s).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1');
    expect(s).toContain('EXDATE;VALUE=DATE:20260228');
    expect(s).toContain('TRIGGER:PT9H');
    expect(s).toContain('TRIGGER:-PT15H');
  });

  it('правила повторов', () => {
    expect(rrule({ freq: 'weekly', interval: 2, days: [4, 0] }, '2026-12-01')).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR');
    expect(rrule({ freq: 'daily', interval: 1, until: '2026-12-31' }, '2026-12-01')).toBe('FREQ=DAILY;UNTIL=20261231T235959');
    expect(icsDuration(-3 * 1440 + 540)).toBe('-P2DT15H');
    expect(icsDuration(-1440)).toBe('-P1D');
  });

  it('день рождения — ежегодно', () => {
    const s = buildICS([birthdayItem({ id: '1', name: 'Зарина', date: '1998-03-10' })]);
    expect(s).toContain('RRULE:FREQ=YEARLY');
    expect(s).toContain('DTSTART;VALUE=DATE:19980310');
  });

  it('длинные строки переносятся не длиннее 75 байт', () => {
    const s = buildICS([{ uid: 'x', title: 'Очень '.repeat(40), date: '2026-12-01', start: null }]);
    for (const line of s.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(s)).toContain('SUMMARY:' + 'Очень '.repeat(40).trim());
  });

  it('имя файла латиницей', () => {
    expect(icsFileName('💳 Подготовить отчёт — 650 ₽')).toBe('podgotovit-otchet-650.ics');
    expect(icsFileName('🎂')).toBe('life-os.ics');
  });
});
