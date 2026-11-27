// Ядро слоя действий: запись изменений с возможностью отмены.
// Все изменения данных в приложении идут через функции из src/actions/*,
// а не напрямую через db.* — так работают «Отменить», синхронизация и (позже) ИИ-чат.
import { db, type DataTable } from '@/db/db';
import type { BaseRecord } from '@/db/types';
import { uid } from '@/lib/id';

interface Change {
  table: DataTable;
  id: string;
  /** Состояние записи до изменения; undefined — записи не было */
  before: BaseRecord | undefined;
}

export interface UndoEntry {
  label: string;
  at: number;
  changes: Change[];
}

let batch: Change[] | null = null;
const undoStack: UndoEntry[] = [];
const listeners = new Set<() => void>();

export function onUndoChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function table(name: DataTable) {
  return db.table(name) as unknown as import('dexie').Table<BaseRecord, string>;
}

function remember(t: DataTable, id: string, before: BaseRecord | undefined) {
  if (batch && !batch.some((c) => c.table === t && c.id === id)) batch.push({ table: t, id, before });
}

/** Выполнить действие как одну отменяемую операцию */
export async function runAction<T>(label: string, fn: () => Promise<T>): Promise<T> {
  // Вложенные действия попадают в внешнюю операцию
  if (batch) return fn();
  batch = [];
  try {
    const result = await fn();
    if (batch.length) {
      undoStack.push({ label, at: Date.now(), changes: batch });
      if (undoStack.length > 50) undoStack.shift();
      listeners.forEach((l) => l());
    }
    return result;
  } finally {
    batch = null;
  }
}

/** Отменить последнее действие. Возвращает его название или null. */
export async function undoLast(): Promise<string | null> {
  const entry = undoStack.pop();
  if (!entry) return null;
  for (const c of [...entry.changes].reverse()) {
    if (c.before === undefined) await table(c.table).delete(c.id);
    else await table(c.table).put({ ...c.before, updatedAt: Date.now() });
  }
  listeners.forEach((l) => l());
  return entry.label;
}

export function lastUndo(): UndoEntry | undefined {
  return undoStack[undoStack.length - 1];
}

export function now() {
  return Date.now();
}

/** Создать запись с id и отметками времени */
export async function insert<T extends BaseRecord>(t: DataTable, data: Omit<T, keyof BaseRecord> & Partial<BaseRecord>): Promise<T> {
  const ts = now();
  const rec = { ...data, id: data.id ?? uid(), createdAt: data.createdAt ?? ts, updatedAt: ts } as T;
  remember(t, rec.id, undefined);
  await table(t).add(rec);
  return rec;
}

/** Изменить поля записи */
export async function patch<T extends BaseRecord>(t: DataTable, id: string, changes: Partial<T>): Promise<T | undefined> {
  const before = await table(t).get(id);
  if (!before) return undefined;
  remember(t, id, before);
  const after = { ...before, ...changes, updatedAt: now() } as T;
  await table(t).put(after);
  return after;
}

/** Записать запись целиком как есть (импорт копии). updatedAt не меняется. */
export async function putRaw(t: DataTable, rec: BaseRecord) {
  remember(t, rec.id, await table(t).get(rec.id));
  await table(t).put(rec);
}

/** Удалить запись навсегда (очистка корзины, «заменить» при импорте). Внутри runAction — отменяемо. */
export async function hardDelete(t: DataTable, id: string) {
  const before = await table(t).get(id);
  if (!before) return;
  remember(t, id, before);
  await table(t).delete(id);
}

/** Мягкое удаление (в корзину) */
export async function softDelete(t: DataTable, id: string) {
  return patch(t, id, { deletedAt: now() });
}

/** Восстановить из корзины */
export async function restore(t: DataTable, id: string) {
  return patch(t, id, { deletedAt: null });
}

/** Только «живые» записи (не в корзине) */
export const alive = <T extends BaseRecord>(r: T) => !r.deletedAt;
