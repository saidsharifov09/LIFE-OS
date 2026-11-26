import Dexie, { type Table } from 'dexie';
import type {
  Task, CalendarEvent, InboxItem, Account, Transaction, Note, NoteSection,
  LaterItem, LogEntry, ReviewRecord, Setting,
} from './types';

/**
 * Локальная база Life OS (IndexedDB через Dexie).
 * Историю версий схемы и правила миграций смотри в docs/DATA.md.
 * ВАЖНО: никогда не меняй старые version(...) — только добавляй новые.
 */
export class LifeDB extends Dexie {
  tasks!: Table<Task, string>;
  events!: Table<CalendarEvent, string>;
  inbox!: Table<InboxItem, string>;
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  notes!: Table<Note, string>;
  noteSections!: Table<NoteSection, string>;
  later!: Table<LaterItem, string>;
  log!: Table<LogEntry, string>;
  reviews!: Table<ReviewRecord, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('lifeos');
    // v1 — стартовая схема (Этап 0–2).
    // Булевы поля (done, processed…) не индексируем: IndexedDB не умеет индексировать boolean.
    this.version(1).stores({
      tasks: 'id, date, topDate, updatedAt, deletedAt',
      events: 'id, date, taskId, updatedAt, deletedAt',
      inbox: 'id, createdAt, updatedAt, deletedAt',
      accounts: 'id, updatedAt, deletedAt',
      transactions: 'id, date, type, accountId, category, updatedAt, deletedAt',
      notes: 'id, sectionId, updatedAt, deletedAt',
      noteSections: 'id, order, updatedAt, deletedAt',
      later: 'id, updatedAt, deletedAt',
      log: 'id, date, kind, updatedAt, deletedAt',
      reviews: 'id, [date+kind], updatedAt, deletedAt',
      settings: 'key',
    });
  }
}

export const db = new LifeDB();

/** Текущая версия схемы — пишется в резервные копии */
export const SCHEMA_VERSION = 1;

/** Таблицы с пользовательскими данными (для экспорта, демо, синхронизации) */
export const DATA_TABLES = [
  'tasks', 'events', 'inbox', 'accounts', 'transactions', 'notes',
  'noteSections', 'later', 'log', 'reviews',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];
