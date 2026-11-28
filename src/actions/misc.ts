// Действия: обзоры дня и настройки. Блокнот, «посмотреть позже» и история — в notes.ts, люди — в people.ts
import { db } from '@/db/db';
import type { DateStr, ReviewRecord } from '@/db/types';
import { today } from '@/lib/dates';
import { alive, insert, patch, runAction } from './core';

// ---------- Утренний обзор и вечерний отчёт ----------
export function markReview(kind: ReviewRecord['kind'], date: DateStr = today(), intention?: string) {
  return runAction(kind === 'morning' ? 'Утренний обзор' : 'Вечерний отчёт', async () => {
    const existing = (await db.reviews.where('[date+kind]').equals([date, kind]).toArray()).filter(alive)[0];
    if (existing) return patch<ReviewRecord>('reviews', existing.id, { intention });
    return insert<ReviewRecord>('reviews', { date, kind, intention });
  });
}

export async function getReview(kind: ReviewRecord['kind'], date: DateStr = today()) {
  return (await db.reviews.where('[date+kind]').equals([date, kind]).toArray()).filter(alive)[0];
}

// ---------- Настройки ----------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value, updatedAt: Date.now() });
}
