// Типы всех сущностей Life OS. Любая запись имеет id, createdAt, updatedAt
// и необязательный deletedAt (мягкое удаление → корзина на 30 дней, нужна и для синхронизации).

export type ID = string;
/** Дата в формате YYYY-MM-DD (локальная) */
export type DateStr = string;
/** Время в формате HH:mm */
export type TimeStr = string;

export interface BaseRecord {
  id: ID;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  /** true — запись создана кнопкой «Демо-данные» и удаляется одной кнопкой */
  demo?: boolean;
}

export type Priority = 0 | 1 | 2 | 3; // 0 — нет, 1 — низкий, 2 — средний, 3 — высокий

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Каждые N дней/недель/месяцев */
  interval: number;
  /** Для weekly: дни недели 0..6 (0 — понедельник) */
  days?: number[];
  /** Повторять до даты включительно (необязательно) */
  until?: DateStr | null;
}

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task extends BaseRecord {
  title: string;
  notes?: string;
  date?: DateStr | null;
  time?: TimeStr | null;
  priority: Priority;
  category?: string | null;
  color?: string | null;
  subtasks: Subtask[];
  done: boolean;
  doneAt?: number | null;
  recurrence?: Recurrence | null;
  /** Дата, на которую задача отмечена как один из «3 главных приоритетов» */
  topDate?: DateStr | null;
  /** Связанное событие календаря */
  eventId?: ID | null;
}

export interface CalendarEvent extends BaseRecord {
  title: string;
  notes?: string;
  date: DateStr;
  /** Начало HH:mm; null — событие на весь день */
  start?: TimeStr | null;
  /** Длительность в минутах */
  duration: number;
  color: string;
  recurrence?: Recurrence | null;
  /** Исключённые даты повторяющегося события */
  exdates?: DateStr[];
  taskId?: ID | null;
  /** За сколько минут напоминать (внутри приложения и в .ics) */
  remind?: number[];
}

export interface CaptureHints {
  date?: DateStr | null;
  time?: TimeStr | null;
  amount?: number | null;
  currency?: Currency | null;
  /** Похоже на доход (+5000, «зарплата») или расход */
  moneyKind?: 'expense' | 'income' | null;
  /** Текст без распознанных частей (предлагаемое название) */
  cleanText?: string;
}

export interface InboxItem extends BaseRecord {
  text: string;
  hints?: CaptureHints;
  processed: boolean;
}

export type Currency = 'RUB' | 'TJS' | 'USD';

export interface Account extends BaseRecord {
  name: string;
  kind: 'cash' | 'card' | 'savings' | 'other';
  currency: Currency;
  /** Начальный остаток; текущий считается по операциям */
  initialBalance: number;
  color?: string;
  archived?: boolean;
}

export interface Transaction extends BaseRecord {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: Currency;
  accountId?: ID | null;
  toAccountId?: ID | null;
  category?: string | null;
  date: DateStr;
  note?: string;
  /** Перевод между счетами в разных валютах: сколько пришло на счёт назначения (в его валюте) */
  toAmount?: number | null;
  /** Перевод в копилку / из копилки */
  savingsId?: ID | null;
  /** Операция создана оплатой регулярного платежа */
  recurringId?: ID | null;
}

/** Бюджет на месяц по категории расходов (сумма в рублях). category '__total' — общий бюджет месяца */
export interface Budget extends BaseRecord {
  category: string;
  amount: number;
}

/** Регулярный платёж или подписка (или регулярный доход) */
export interface RecurringPayment extends BaseRecord {
  title: string;
  kind: 'expense' | 'income';
  amount: number;
  currency: Currency;
  category?: string | null;
  accountId?: ID | null;
  /** Первая дата (опора для повторов) */
  startDate: DateStr;
  recurrence: Recurrence;
  /** Ближайшая дата списания */
  nextDate: DateStr | null;
  /** Подписка (показывается отдельной пометкой) */
  subscription?: boolean;
  active: boolean;
}

/** Долг: мне должны (they_owe) или я должен (i_owe) */
export interface Debt extends BaseRecord {
  person: string;
  direction: 'they_owe' | 'i_owe';
  amount: number;
  currency: Currency;
  /** Сколько уже вернули */
  paid: number;
  due?: DateStr | null;
  note?: string;
  closed: boolean;
}

/** Копилка — цель накоплений */
export interface SavingsGoal extends BaseRecord {
  name: string;
  target: number;
  currency: Currency;
  saved: number;
  deadline?: DateStr | null;
  color: string;
  closed?: boolean;
}

export interface Note extends BaseRecord {
  title: string;
  body: string;
  sectionId: ID;
  tags: string[];
  pinned: boolean;
  archived: boolean;
}

export interface NoteSection extends BaseRecord {
  name: string;
  order: number;
  icon?: string;
}

export interface LaterItem extends BaseRecord {
  title: string;
  url?: string;
  kind: 'link' | 'video' | 'movie' | 'article' | 'book' | 'other';
  done: boolean;
}

export interface LogEntry extends BaseRecord {
  date: DateStr;
  time?: TimeStr | null;
  text: string;
  kind: 'note' | 'place' | 'activity' | 'people' | 'learned' | 'decision' | 'evening';
  mood?: 1 | 2 | 3 | 4 | 5 | null;
}

/** Отметка о прохождении утреннего обзора / вечернего отчёта */
export interface ReviewRecord extends BaseRecord {
  date: DateStr;
  kind: 'morning' | 'evening';
  intention?: string;
}

export interface Setting {
  key: string;
  value: unknown;
  updatedAt: number;
}

// ---------- Этап 5: цели, привычки, здоровье ----------

export interface Milestone {
  id: ID;
  title: string;
  done: boolean;
  due?: DateStr | null;
}

/** Цель с этапами. Прогресс — по этапам или вручную (если этапов нет) */
export interface Goal extends BaseRecord {
  title: string;
  /** Зачем это мне — мотивация, которую видно каждый раз */
  why?: string;
  deadline?: DateStr | null;
  color: string;
  emoji?: string;
  milestones: Milestone[];
  /** Ручной прогресс 0–100 (когда этапов нет) */
  progress: number;
  done: boolean;
  doneAt?: number | null;
  archived?: boolean;
}

/** Привычка: в какие дни недели и сколько раз в день */
export interface Habit extends BaseRecord {
  title: string;
  emoji: string;
  color: string;
  /** Дни недели 0..6 (0 — понедельник); пусто — каждый день */
  days: number[];
  /** Сколько раз в день (например, 2 раза — зубы утром и вечером) */
  target: number;
  goalId?: ID | null;
  order: number;
  archived?: boolean;
}

/** Отметка привычки за день. id = `${habitId}_${date}` — одна запись на день, без дублей при синхронизации */
export interface HabitCheck extends BaseRecord {
  habitId: ID;
  date: DateStr;
  count: number;
}

/** Здоровье за день. id = `day_${date}` */
export interface HealthDay extends BaseRecord {
  date: DateStr;
  /** Сон, часы */
  sleep?: number | null;
  /** Вода, стаканы (250 мл) */
  water?: number | null;
  /** Вес, кг */
  weight?: number | null;
  /** Настроение 1–5 */
  mood?: 1 | 2 | 3 | 4 | 5 | null;
  /** Самочувствие (энергия) 1–5 */
  feeling?: 1 | 2 | 3 | 4 | 5 | null;
  note?: string;
}

export interface Workout extends BaseRecord {
  date: DateStr;
  kind: string;
  minutes: number;
  note?: string;
}
