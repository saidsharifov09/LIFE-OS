// Действия: блокнот (разделы и заметки), «Посмотреть позже», история (Life Log). Этап 6.
import { db } from '@/db/db';
import type { DateStr, ID, LaterItem, LaterKind, LogEntry, LogKind, Note, NoteImage, NoteSection, Person, TimeStr } from '@/db/types';
import { DEFAULT_NOTE_SECTIONS } from '@/lib/categories';
import { nowTime, today } from '@/lib/dates';
import { extractLinks, guessLaterKind, titleWithoutUrl } from '@/lib/links';
import { alive, insert, now, patch, runAction, softDelete } from './core';

// ================= Блокнот =================

/** id стартового раздела предсказуемый — на iPhone и ноутбуке это один и тот же раздел (без дублей при синхронизации) */
const defaultSectionId = (i: number) => `sec_default_${i}`;

export async function listSections(): Promise<NoteSection[]> {
  return (await db.noteSections.toArray()).filter(alive).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Создаёт стартовые разделы блокнота, если живых разделов нет */
export async function ensureNoteSections(): Promise<NoteSection[]> {
  const existing = await listSections();
  if (existing.length) return existing;
  const created: NoteSection[] = [];
  for (let i = 0; i < DEFAULT_NOTE_SECTIONS.length; i++) {
    const { name, icon } = DEFAULT_NOTE_SECTIONS[i];
    const id = defaultSectionId(i);
    const old = await db.noteSections.get(id);
    // Раздел мог лежать в корзине — возвращаем его, а не создаём второй с тем же id
    created.push(old ? (await patch<NoteSection>('noteSections', id, { deletedAt: null, order: i }))! : await insert<NoteSection>('noteSections', { id, name, icon, order: i }));
  }
  return created;
}

export function addSection(name: string, icon?: string) {
  return runAction('Новый раздел', async () => {
    const list = await ensureNoteSections();
    const order = list.length ? Math.max(...list.map((s) => s.order)) + 1 : 0;
    return insert<NoteSection>('noteSections', { name: name.trim() || 'Без названия', icon: icon || '📁', order });
  });
}

export function updateSection(id: string, changes: Partial<Pick<NoteSection, 'name' | 'icon'>>) {
  const c = { ...changes };
  if (c.name !== undefined) c.name = c.name.trim() || 'Без названия';
  return runAction('Раздел блокнота', () => patch<NoteSection>('noteSections', id, c));
}

/** Переставить раздел на одну позицию вверх (-1) или вниз (+1) */
export function moveSection(id: string, dir: -1 | 1) {
  return runAction('Порядок разделов', async () => {
    const list = await listSections();
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) await patch<NoteSection>('noteSections', list[k].id, { order: k });
  });
}

/**
 * Удалить раздел. Заметки не пропадают: переезжают в «Разное» (или в первый оставшийся раздел).
 * Последний раздел удалить нельзя. Возвращает раздел, куда переехали заметки.
 */
export function deleteSection(id: string) {
  return runAction('Удаление раздела', async () => {
    const list = await listSections();
    const rest = list.filter((s) => s.id !== id);
    if (!rest.length) throw new Error('Нельзя удалить последний раздел');
    const target = rest.find((s) => s.name === 'Разное') ?? rest[0];
    const notes = (await db.notes.where('sectionId').equals(id).toArray()).filter(alive);
    for (const n of notes) await patch<Note>('notes', n.id, { sectionId: target.id });
    await softDelete('noteSections', id);
    return target;
  });
}

/** Тег: без «#», маленькими буквами, без лишних пробелов */
export function normalizeTag(t: string): string {
  return t.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 40);
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

export function addNote(input: { title: string; body?: string; sectionId?: string; tags?: string[]; images?: NoteImage[]; pinned?: boolean; demo?: boolean }) {
  return runAction('Новая заметка', async () => {
    const sections = await ensureNoteSections();
    let sectionId = input.sectionId && sections.some((s) => s.id === input.sectionId) ? input.sectionId : undefined;
    if (!sectionId) sectionId = (sections.find((s) => s.name === 'Разное') ?? sections[0]).id;
    return insert<Note>('notes', {
      title: input.title.trim(), body: input.body ?? '', sectionId, tags: normalizeTags(input.tags ?? []),
      images: input.images ?? [], pinned: !!input.pinned, archived: false, demo: input.demo,
    });
  });
}

export function updateNote(id: string, changes: Partial<Note>) {
  return runAction('Изменение заметки', () => patch<Note>('notes', id, changes.tags ? { ...changes, tags: normalizeTags(changes.tags) } : changes));
}

export function pinNote(id: string, pinned: boolean) {
  return runAction(pinned ? 'Закрепить заметку' : 'Открепить заметку', () => patch<Note>('notes', id, { pinned }));
}

export function archiveNote(id: string, archived: boolean) {
  return runAction(archived ? 'В архив' : 'Из архива', () => patch<Note>('notes', id, archived ? { archived, pinned: false } : { archived }));
}

export function deleteNote(id: string) {
  return runAction('Удаление заметки', () => softDelete('notes', id));
}

/** Живые заметки: закреплённые сверху, потом свежие */
export async function listNotes(opts: { sectionId?: string; archived?: boolean } = {}): Promise<Note[]> {
  const rows = opts.sectionId ? await db.notes.where('sectionId').equals(opts.sectionId).toArray() : await db.notes.toArray();
  return rows
    .filter(alive)
    .filter((n) => (opts.archived === undefined ? true : !!n.archived === opts.archived))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

/** Ссылки заметки (из текста) */
export function noteLinks(n: Pick<Note, 'title' | 'body'>): string[] {
  return extractLinks(`${n.title}\n${n.body}`);
}

// ================= Посмотреть позже =================

export function addLater(input: { title: string; url?: string; kind?: LaterKind; note?: string; demo?: boolean }) {
  return runAction('Посмотреть позже', () => {
    const url = input.url?.trim() || extractLinks(input.title)[0];
    const kind = input.kind ?? guessLaterKind(input.title, url);
    const title = titleWithoutUrl(input.title, url) || 'Без названия';
    return insert<LaterItem>('later', { title, url: url || undefined, kind, done: false, doneAt: null, note: input.note, demo: input.demo });
  });
}

export function updateLater(id: string, changes: Partial<LaterItem>) {
  return runAction('Изменение', () => patch<LaterItem>('later', id, changes));
}

/** Отметить «посмотрел / прочитал» или вернуть в список */
export function markLater(id: string, done = true) {
  return runAction(done ? 'Посмотрел' : 'Снова в списке', () => patch<LaterItem>('later', id, { done, doneAt: done ? now() : null }));
}

export function deleteLater(id: string) {
  return runAction('Удаление', () => softDelete('later', id));
}

export async function listLater(): Promise<LaterItem[]> {
  return (await db.later.toArray()).filter(alive).sort((a, b) => Number(a.done) - Number(b.done) || (a.done ? (b.doneAt ?? 0) - (a.doneAt ?? 0) : b.createdAt - a.createdAt));
}

// ================= История (Life Log) =================

/** Обновить «последний контакт» людей, если запись новее */
async function touchContacts(ids: ID[] | undefined, date: DateStr) {
  for (const id of ids ?? []) {
    const p = await db.people.get(id);
    if (p && !p.deletedAt && (!p.lastContact || p.lastContact < date)) await patch<Person>('people', id, { lastContact: date });
  }
}

export function addLogEntry(input: { text: string; kind?: LogKind; date?: DateStr; time?: TimeStr | null; mood?: LogEntry['mood']; personIds?: ID[]; demo?: boolean }) {
  return runAction('Запись в историю', async () => {
    const date = input.date ?? today();
    const rec = await insert<LogEntry>('log', {
      text: input.text.trim(), kind: input.kind ?? 'note', date,
      time: input.time === undefined ? nowTime() : input.time, mood: input.mood ?? null,
      personIds: input.personIds?.length ? input.personIds : undefined, demo: input.demo,
    });
    await touchContacts(input.personIds, date);
    return rec;
  });
}

export function updateLogEntry(id: string, changes: Partial<LogEntry>) {
  return runAction('Изменение записи', async () => {
    const after = await patch<LogEntry>('log', id, changes);
    if (after && changes.personIds) await touchContacts(changes.personIds, after.date);
    return after;
  });
}

export function deleteLogEntry(id: string) {
  return runAction('Удаление записи', () => softDelete('log', id));
}

/** Записи за период (включительно), новые сверху; внутри дня — по времени, поздние сверху */
export async function logRange(from: DateStr, to: DateStr): Promise<LogEntry[]> {
  return (await db.log.where('date').between(from, to, true, true).toArray())
    .filter(alive)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '') || b.createdAt - a.createdAt);
}

/** Записи истории, где упоминается человек */
export async function logForPerson(personId: ID, limit = 20): Promise<LogEntry[]> {
  return (await db.log.toArray())
    .filter(alive)
    .filter((e) => e.personIds?.includes(personId))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))
    .slice(0, limit);
}
