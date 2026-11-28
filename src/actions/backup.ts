// Действия: резервная копия (экспорт/импорт всех данных) и корзина на 30 дней.
import { db, DATA_TABLES, SCHEMA_VERSION, type DataTable } from '@/db/db';
import type { BaseRecord } from '@/db/types';
import { LOCAL_SETTING_KEYS, validateBackup, type Backup } from '@/lib/backup';
import { findCategory } from '@/lib/categories';
import { fmtMoney } from '@/lib/format';
import { hardDelete, now, patch, putRaw, runAction } from './core';
import { getSetting, setSetting } from './misc';

// ---------- Резервная копия ----------

/** Собрать копию всех данных (включая корзину — чтобы «заменить» ничего не терял) */
export async function exportAll(): Promise<Backup> {
  const tables: Record<string, BaseRecord[]> = {};
  for (const t of DATA_TABLES) tables[t] = (await db.table(t).toArray()) as BaseRecord[];
  const settings = (await db.settings.toArray()).filter((s) => !LOCAL_SETTING_KEYS.includes(s.key));
  return { app: 'life-os', format: 1, schemaVersion: SCHEMA_VERSION, exportedAt: now(), tables, settings };
}

/** Отметить, что копия сохранена (для еженедельного напоминания) */
export function markBackupDone(at = now()) {
  return setSetting('lastBackupAt', at);
}

export type ImportMode = 'merge' | 'replace';
export interface ImportResult { added: number; updated: number; removed: number; kept: number }

/**
 * Восстановить данные из копии.
 * - merge («объединить»): новые записи добавляются, существующие — побеждает более новая правка (updatedAt);
 * - replace («заменить»): на устройстве остаётся ровно то, что в копии.
 * Одно отменяемое действие: «Отменить» в тосте вернёт всё как было (кроме настроек).
 */
export async function importBackup(input: Backup, mode: ImportMode): Promise<ImportResult> {
  const b = validateBackup(input, SCHEMA_VERSION);
  return runAction(mode === 'replace' ? 'Восстановление (замена)' : 'Восстановление (объединение)', async () => {
    const res: ImportResult = { added: 0, updated: 0, removed: 0, kept: 0 };
    for (const t of DATA_TABLES) {
      const incoming = b.tables[t] ?? [];
      const existing = new Map(((await db.table(t).toArray()) as BaseRecord[]).map((r) => [r.id, r]));
      const incomingIds = new Set<string>();
      for (const rec of incoming) {
        incomingIds.add(rec.id);
        const cur = existing.get(rec.id);
        if (!cur) { await putRaw(t, rec); res.added++; continue; }
        const newer = (rec.updatedAt ?? 0) > (cur.updatedAt ?? 0);
        if (mode === 'replace' || newer) {
          if (JSON.stringify(cur) !== JSON.stringify(rec)) { await putRaw(t, rec); res.updated++; } else res.kept++;
        } else res.kept++;
      }
      if (mode === 'replace') {
        for (const id of existing.keys()) {
          if (!incomingIds.has(id)) { await hardDelete(t, id); res.removed++; }
        }
      }
    }
    // Настройки (курсы, счёт по умолчанию, порядок виджетов): при замене — из копии, при объединении — более новые
    for (const s of b.settings) {
      if (LOCAL_SETTING_KEYS.includes(s.key)) continue;
      const cur = await db.settings.get(s.key);
      if (mode === 'replace' || !cur || (s.updatedAt ?? 0) > (cur.updatedAt ?? 0)) await db.settings.put(s);
    }
    return res;
  });
}

// ---------- Еженедельное напоминание ----------

const WEEK = 7 * 86400000;

/** Пора ли напомнить о копии: прошло 7 дней с последней (или копий не было, а данные есть) */
export async function backupDue(at = now()): Promise<{ due: boolean; lastAt: number | null }> {
  const lastAt = await getSetting<number | null>('lastBackupAt', null);
  const snooze = await getSetting<number | null>('backupSnoozeUntil', null);
  if (snooze && snooze > at) return { due: false, lastAt };
  if (lastAt && at - lastAt < WEEK) return { due: false, lastAt };
  if (!lastAt) {
    // Нет смысла напоминать на пустом приложении или с одними демо-данными
    let mine = 0;
    for (const t of ['tasks', 'events', 'transactions', 'notes', 'inbox'] as DataTable[]) {
      mine += ((await db.table(t).toArray()) as BaseRecord[]).filter((r) => !r.demo).length;
      if (mine >= 5) break;
    }
    if (mine < 5) return { due: false, lastAt };
  }
  return { due: true, lastAt };
}

/** «Напомнить позже» — через 2 дня */
export function snoozeBackup(at = now()) {
  return setSetting('backupSnoozeUntil', at + 2 * 86400000);
}

// ---------- Корзина ----------

export const TRASH_DAYS = 30;

export interface TrashItem {
  table: DataTable;
  id: string;
  title: string;
  kind: string;
  deletedAt: number;
  /** Сколько дней осталось до автоудаления */
  daysLeft: number;
}

const KIND: Record<DataTable, string> = {
  tasks: 'Задача', events: 'Событие', inbox: 'Входящие', accounts: 'Счёт', transactions: 'Операция', notes: 'Заметка',
  noteSections: 'Раздел блокнота', later: 'Посмотреть позже', log: 'История', reviews: 'Обзор дня', budgets: 'Бюджет',
  recurring: 'Платёж', debts: 'Долг', savings: 'Копилка',
  goals: 'Цель', habits: 'Привычка', habitChecks: 'Отметка привычки', health: 'Здоровье', workouts: 'Тренировка',
  people: 'Человек',
};

function titleOf(t: DataTable, r: Record<string, unknown>): string {
  const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  switch (t) {
    case 'transactions': {
      const cat = findCategory(s('category'), r.type === 'income' ? 'income' : 'expense')?.name;
      const label = s('note') || cat || (r.type === 'transfer' ? 'Перевод' : '');
      return `${label}${label ? ' · ' : ''}${fmtMoney(Number(r.amount) || 0, (r.currency as never) ?? 'RUB')}`;
    }
    case 'budgets': return s('category') === '__total' ? 'Общий бюджет месяца' : findCategory(s('category'))?.name ?? s('category');
    case 'debts': return `${s('person')} · ${fmtMoney(Number(r.amount) || 0, (r.currency as never) ?? 'RUB')}`;
    case 'reviews': return `${r.kind === 'morning' ? 'Утренний обзор' : 'Вечерний отчёт'} · ${s('date')}`;
    case 'inbox': case 'log': return s('text');
    case 'habitChecks': return `Отметка · ${s('date')}`;
    case 'health': return `Здоровье · ${s('date')}`;
    case 'workouts': return `${s('kind')} · ${Number(r.minutes) || 0} мин · ${s('date')}`;
    case 'accounts': case 'savings': case 'noteSections': return s('name');
    default: return s('title') || s('name') || s('text') || 'Без названия';
  }
}

export async function listTrash(at = now()): Promise<TrashItem[]> {
  const items: TrashItem[] = [];
  for (const t of DATA_TABLES) {
    const rows = (await db.table(t).toArray()) as BaseRecord[];
    for (const r of rows) {
      if (!r.deletedAt) continue;
      items.push({
        table: t, id: r.id, title: titleOf(t, r as unknown as Record<string, unknown>), kind: KIND[t], deletedAt: r.deletedAt,
        daysLeft: Math.max(0, Math.ceil((r.deletedAt + TRASH_DAYS * 86400000 - at) / 86400000)),
      });
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export function restoreFromTrash(t: DataTable, id: string) {
  return runAction('Восстановление из корзины', () => patch(t, id, { deletedAt: null }));
}

/** Удалить навсегда одну запись (можно отменить, пока открыто приложение) */
export function purgeItem(t: DataTable, id: string) {
  return runAction('Удаление навсегда', () => hardDelete(t, id));
}

export function emptyTrash() {
  return runAction('Очистка корзины', async () => {
    const items = await listTrash();
    for (const it of items) await hardDelete(it.table, it.id);
    return items.length;
  });
}

/** Автоочистка: удаляет записи, пролежавшие в корзине больше 30 дней. Вызывается при запуске приложения. */
export async function autoPurgeTrash(at = now()): Promise<number> {
  const limit = at - TRASH_DAYS * 86400000;
  let n = 0;
  for (const t of DATA_TABLES) {
    const ids = ((await db.table(t).toArray()) as BaseRecord[]).filter((r) => r.deletedAt && r.deletedAt < limit).map((r) => r.id);
    if (ids.length) { await db.table(t).bulkDelete(ids); n += ids.length; }
  }
  return n;
}
