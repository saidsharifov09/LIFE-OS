import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Task } from '@/db/types';
import { localMoment, planPush } from './pushPlan';

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1', title: 'Встреча с Али', date: '2026-11-26', start: '15:00', duration: 60, color: '#fff', notes: '',
  recurrence: null, exdates: [], taskId: null, remind: [15], createdAt: 0, updatedAt: 0, ...p,
} as CalendarEvent);
const task = (p: Partial<Task>): Task => ({
  id: 't1', title: 'Позвонить маме', notes: '', date: '2026-11-26', time: '18:00', priority: 0, category: null,
  subtasks: [], done: false, doneAt: null, recurrence: null, topDate: null, createdAt: 0, updatedAt: 0, ...p,
} as Task);
const now = new Date(2026, 10, 26, 12, 0); // 26 ноября, 12:00 по времени устройства

describe('расписание push-напоминаний', () => {
  it('события за N минут и задачи со временем; прошлое не берём', () => {
    const items = planPush([ev({}), ev({ id: 'e2', start: '09:00' })], [task({}), task({ id: 't2', time: null })], { now });
    expect(items.map((i) => i.id)).toEqual(['e:e1:2026-11-26:15', 't:t1:2026-11-26']);
    expect(items[0].fireAt).toBe(localMoment('2026-11-26', '15:00', 15).toISOString());
    expect(items[0].url).toBe('#/calendar?date=2026-11-26&open=e1');
  });

  it('по умолчанию без названий дел; с настройкой — с названиями', () => {
    const [hidden] = planPush([ev({})], [], { now });
    expect(hidden.title).toBe('Life OS');
    expect(JSON.stringify(hidden)).not.toContain('Али');
    const [shown] = planPush([ev({})], [], { now, showTitles: true });
    expect(shown.title).toBe('Встреча с Али');
  });

  it('повторы на 14 дней вперёд, выполненные и удалённые не напоминаются', () => {
    const daily = ev({ recurrence: { freq: 'daily', interval: 1 }, remind: [0] });
    expect(planPush([daily], [], { now })).toHaveLength(14);
    expect(planPush([ev({ deletedAt: 1 })], [task({ done: true })], { now })).toEqual([]);
  });
});
