import { describe, expect, it } from 'vitest';
import { parseCapture } from './parse';
import { occursOn, nextOccurrence, describeRecurrence } from './dates';

// 2026-11-26 — четверг
const BASE = '2026-11-26';

describe('parseCapture', () => {
  it('завтра', () => {
    const h = parseCapture('позвонить маме завтра', BASE);
    expect(h.date).toBe('2026-11-27');
    expect(h.cleanText).toBe('Позвонить маме');
    expect(h.amount).toBeUndefined();
  });
  it('в пятницу в 15:00', () => {
    const h = parseCapture('встреча с Али в пятницу в 15:00', BASE);
    expect(h.date).toBe('2026-11-27');
    expect(h.time).toBe('15:00');
    expect(h.cleanText).toBe('Встреча с Али');
  });
  it('в четверг (сегодня) — сегодня', () => {
    expect(parseCapture('отчёт в четверг', BASE).date).toBe(BASE);
  });
  it('в понедельник', () => {
    expect(parseCapture('спортзал в понедельник', BASE).date).toBe('2026-11-30');
  });
  it('кофе 250 → расход', () => {
    const h = parseCapture('кофе 250', BASE);
    expect(h.amount).toBe(250);
    expect(h.moneyKind).toBe('expense');
    expect(h.cleanText).toBe('Кофе');
    expect(h.date).toBeUndefined();
  });
  it('сумма с валютой', () => {
    const h = parseCapture('такси 350 руб', BASE);
    expect(h.amount).toBe(350);
    expect(h.currency).toBe('RUB');
    const u = parseCapture('подписка $20', BASE);
    expect(u.amount).toBe(20);
    expect(u.currency).toBe('USD');
    const t = parseCapture('обед 45 смн', BASE);
    expect(t.currency).toBe('TJS');
  });
  it('доход', () => {
    const h = parseCapture('+50000 зарплата', BASE);
    expect(h.amount).toBe(50000);
    expect(h.moneyKind).toBe('income');
  });
  it('в 7 вечера', () => {
    const h = parseCapture('ужин завтра в 7 вечера', BASE);
    expect(h.time).toBe('19:00');
    expect(h.date).toBe('2026-11-27');
    expect(h.amount).toBeUndefined();
  });
  it('5 декабря', () => {
    expect(parseCapture('день рождения Зарины 5 декабря', BASE).date).toBe('2026-12-05');
  });
  it('дата в прошлом → следующий год', () => {
    expect(parseCapture('отпуск 10.03', BASE).date).toBe('2027-03-10');
  });
  it('через 3 дня / через неделю', () => {
    expect(parseCapture('напомнить через 3 дня', BASE).date).toBe('2026-11-29');
    expect(parseCapture('проверить через неделю', BASE).date).toBe('2026-12-03');
  });
  it('время с точкой только с предлогом', () => {
    expect(parseCapture('звонок в 9.30', BASE).time).toBe('09:30');
  });
  it('обычный текст без подсказок', () => {
    const h = parseCapture('идея для проекта', BASE);
    expect(h.date).toBeUndefined();
    expect(h.time).toBeUndefined();
    expect(h.amount).toBeUndefined();
    expect(h.cleanText).toBeUndefined();
  });
  it('расход с датой', () => {
    const h = parseCapture('продукты 1200 вчера', BASE);
    expect(h.amount).toBe(1200);
    expect(h.date).toBe('2026-11-25');
    expect(h.cleanText).toBe('Продукты');
  });
});

describe('recurrence', () => {
  it('daily', () => {
    expect(occursOn('2026-11-01', { freq: 'daily', interval: 2 }, '2026-11-03')).toBe(true);
    expect(occursOn('2026-11-01', { freq: 'daily', interval: 2 }, '2026-11-04')).toBe(false);
  });
  it('weekly с днями', () => {
    const r = { freq: 'weekly' as const, interval: 1, days: [0, 2, 4] };
    expect(occursOn('2026-11-23', r, '2026-11-25')).toBe(true); // ср
    expect(occursOn('2026-11-23', r, '2026-11-26')).toBe(false); // чт
    expect(nextOccurrence('2026-11-23', r, '2026-11-27')).toBe('2026-11-30');
  });
  it('weekly: дата начала вне выбранных дней не считается', () => {
    const r = { freq: 'weekly' as const, interval: 1, days: [1, 3] };
    expect(occursOn('2026-11-23', r, '2026-11-23')).toBe(false); // пн
    expect(occursOn('2026-11-23', r, '2026-11-24')).toBe(true); // вт
  });
  it('monthly 31 числа', () => {
    const r = { freq: 'monthly' as const, interval: 1 };
    expect(nextOccurrence('2026-01-31', r, '2026-01-31')).toBe('2026-02-28');
  });
  it('описание', () => {
    expect(describeRecurrence({ freq: 'weekly', interval: 1, days: [0, 1, 2, 3, 4] })).toBe('По будням');
  });
});
