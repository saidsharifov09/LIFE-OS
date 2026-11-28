import Dexie, { type Table } from 'dexie';
import type {
  Task, CalendarEvent, InboxItem, Account, Transaction, Note, NoteSection,
  LaterItem, LogEntry, ReviewRecord, Setting, Budget, RecurringPayment, Debt, SavingsGoal,
  Goal, Habit, HabitCheck, HealthDay, Workout,
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
  budgets!: Table<Budget, string>;
  recurring!: Table<RecurringPayment, string>;
  debts!: Table<Debt, string>;
  savings!: Table<SavingsGoal, string>;
  goals!: Table<Goal, string>;
  habits!: Table<Habit, string>;
  habitChecks!: Table<HabitCheck, string>;
  health!: Table<HealthDay, string>;
  workouts!: Table<Workout, string>;

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
    // v2 — Этап 3 (финансы): бюджеты, регулярные платежи, долги, копилки.
    this.version(2).stores({
      budgets: 'id, category, updatedAt, deletedAt',
      recurring: 'id, nextDate, updatedAt, deletedAt',
      debts: 'id, updatedAt, deletedAt',
      savings: 'id, updatedAt, deletedAt',
    });
    // v3 — Этап 5: цели, привычки (отметки по дням), здоровье, тренировки.
    this.version(3).stores({
      goals: 'id, updatedAt, deletedAt',
      habits: 'id, order, updatedAt, deletedAt',
      habitChecks: 'id, habitId, date, updatedAt, deletedAt',
      health: 'id, date, updatedAt, deletedAt',
      workouts: 'id, date, updatedAt, deletedAt',
    });
  }
}

export const db = new LifeDB();

/** Текущая версия схемы — пишется в резервные копии */
export const SCHEMA_VERSION = 3;

/** Таблицы с пользовательскими данными (для экспорта, демо, синхронизации) */
export const DATA_TABLES = [
  'tasks', 'events', 'inbox', 'accounts', 'transactions', 'notes',
  'noteSections', 'later', 'log', 'reviews', 'budgets', 'recurring', 'debts', 'savings',
  'goals', 'habits', 'habitChecks', 'health', 'workouts',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];
