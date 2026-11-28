// Напоминания внутри приложения, пока оно открыто. При закрытом приложении — push через Supabase (Настройки → Уведомления,
// src/modules/notify/push.ts, docs/NOTIFICATIONS.md). Для надёжных напоминаний — кнопка «Добавить в Календарь iPhone» (.ics).
import { useEffect } from 'react';
import { db } from '@/db/db';
import { alive, expandEvents } from '@/actions';
import { nowTime, timeToMin, today } from '@/lib/dates';
import { useToast } from '@/ui/overlay';

const FIRED_KEY = 'lifeos.firedReminders';
const pushOn = () => { try { return !!JSON.parse(localStorage.getItem('lifeos.push') ?? '{}').enabled; } catch { return false; } };

function loadFired(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}'); } catch { return {}; }
}
function saveFired(f: Record<string, number>) {
  // храним только последние сутки
  const cutoff = Date.now() - 86400000;
  const clean = Object.fromEntries(Object.entries(f).filter(([, t]) => t > cutoff));
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
}

/** Что нужно напомнить прямо сейчас */
export async function dueReminders(day = today(), time = nowTime()) {
  const now = timeToMin(time);
  const out: { key: string; text: string }[] = [];
  const events = expandEvents((await db.events.toArray()).filter(alive), day, day);
  for (const { event } of events) {
    if (!event.start) continue;
    const start = timeToMin(event.start);
    for (const before of event.remind?.length ? event.remind : [0]) {
      if (now >= start - before && now < start + 1) {
        out.push({ key: `e:${event.id}:${day}:${before}`, text: before ? `Через ${before} мин: ${event.title}` : `Сейчас: ${event.title}` });
      }
    }
  }
  const tasks = (await db.tasks.toArray()).filter((t) => alive(t) && !t.done && t.date === day && t.time);
  for (const t of tasks) {
    const start = timeToMin(t.time!);
    if (now >= start && now < start + 5) out.push({ key: `t:${t.id}:${day}`, text: `Пора: ${t.title}` });
  }
  return out;
}

export function useReminders() {
  const toast = useToast();
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const fired = loadFired();
      for (const r of await dueReminders()) {
        if (stopped || fired[r.key]) continue;
        fired[r.key] = Date.now();
        toast.show(`🔔 ${r.text}`);
        // Включены push-уведомления — системное пришлёт сервер, здесь только тост (без дубля)
        if ('Notification' in window && Notification.permission === 'granted' && !pushOn()) {
          try { new Notification('Life OS', { body: r.text, icon: `${import.meta.env.BASE_URL}pwa-192.png` }); } catch { /* iOS без PWA */ }
        }
      }
      saveFired(fired);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { stopped = true; clearInterval(id); };
  }, [toast]);
}
