// Действия: заметки, «посмотреть позже», история, обзоры дня, настройки
import { db } from '@/db/db';
import type { DateStr, LaterItem, LogEntry, Note, NoteSection, ReviewRecord, TimeStr } from '@/db/types';
import { DEFAULT_NOTE_SECTIONS } from '@/lib/categories';
import { nowTime, today } from '@/lib/dates';
import { alive, insert, patch, runAction, softDelete } from './core';

// ---------- Блокнот ----------
/** Создаёт стартовые разделы блокнота, если их ещё нет */
export async function ensureNoteSections(): Promise<NoteSection[]> {
  const existing = (await db.noteSections.toArray()).filter(alive);
  if (existing.length) return existing.sort((a, b) => a.order - b.order);
  const created: NoteSection[] = [];
  for (let i = 0; i < DEFAULT_NOTE_SECTIONS.length; i++) {
    created.push(await insert<NoteSection>('noteSections', { name: DEFAULT_NOTE_SECTIONS[i], order: i }));
  }
  return created;
}

export function addNote(input: { title: string; body?: string; sectionId?: string; tags?: string[]; demo?: boolean }) {
  return runAction('Новая заметка', async () => {
    let sectionId = input.sectionId;
    if (!sectionId) {
      const sections = await ensureNoteSections();
      sectionId = (sections.find((s) => s.name === 'Разное') ?? sections[0]).id;
    }
    return insert<Note>('notes', {
      title: input.title, body: input.body ?? '', sectionId, tags: input.tags ?? [],
      pinned: false, archived: false, demo: input.demo,
    });
  });
}

export function updateNote(id: string, changes: Partial<Note>) {
  return runAction('Изменение заметки', () => patch<Note>('notes', id, changes));
}

export function deleteNote(id: string) {
  return runAction('Удаление заметки', () => softDelete('notes', id));
}

// ---------- Посмотреть позже ----------
export function addLater(input: { title: string; url?: string; kind?: LaterItem['kind']; demo?: boolean }) {
  return runAction('Посмотреть позже', () => {
    const url = input.url ?? input.title.match(/https?:\/\/\S+/)?.[0];
    let kind = input.kind ?? 'other';
    if (!input.kind && url) kind = /youtu|vimeo|rutube|tiktok/.test(url) ? 'video' : 'link';
    return insert<LaterItem>('later', { title: input.title, url, kind, done: false, demo: input.demo });
  });
}

export function updateLater(id: string, changes: Partial<LaterItem>) {
  return runAction('Изменение', () => patch<LaterItem>('later', id, changes));
}

// ---------- История ----------
export function addLogEntry(input: { text: string; kind?: LogEntry['kind']; date?: DateStr; time?: TimeStr; mood?: LogEntry['mood']; demo?: boolean }) {
  return runAction('Запись в историю', () =>
    insert<LogEntry>('log', {
      text: input.text, kind: input.kind ?? 'note', date: input.date ?? today(),
      time: input.time ?? nowTime(), mood: input.mood ?? null, demo: input.demo,
    }),
  );
}

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
