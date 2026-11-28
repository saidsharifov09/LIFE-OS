// План помощника: список шагов (вызовов слоя действий) и вопросы «только чтение».
// Один формат для всех уровней: шаблонный разбор (rules.ts) и облачный ИИ (cloud.ts) возвращают Interpretation,
// приложение проверяет его (validateInterpretation), показывает карточку «Что я сделаю» и выполняет после подтверждения.
import type { Currency, DateStr, TimeStr } from '@/db/types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/categories';

/** Шаги, которые меняют данные. Имена людей, привычек и задач — текстом; id ищутся на устройстве (resolve.ts). */
export type PlanStep =
  | { action: 'addTask'; args: { title: string; date?: DateStr | null; time?: TimeStr | null; priority?: 0 | 1 | 2 } }
  | { action: 'addEvent'; args: { title: string; date: DateStr; start?: TimeStr | null; duration?: number } }
  | { action: 'addExpense'; args: { amount: number; currency?: Currency; category?: string; note?: string; date?: DateStr } }
  | { action: 'addIncome'; args: { amount: number; currency?: Currency; category?: string; note?: string; date?: DateStr } }
  | { action: 'moveUnfinished'; args: { from: DateStr; to: DateStr } }
  | { action: 'moveTask'; args: { task: string; date: DateStr | null; time?: TimeStr | null } }
  | { action: 'completeTask'; args: { task: string } }
  | { action: 'addNote'; args: { title: string; body?: string } }
  | { action: 'addLater'; args: { title: string; url?: string } }
  | { action: 'addLogEntry'; args: { text: string; date?: DateStr } }
  | { action: 'checkHabit'; args: { habit: string; date?: DateStr } }
  | { action: 'addWater'; args: { glasses: number } }
  | { action: 'setHealth'; args: { date?: DateStr; sleep?: number; weight?: number; mood?: number } }
  | { action: 'addWorkout'; args: { kind: string; minutes: number; date?: DateStr } }
  | { action: 'addTopic'; args: { person: string; text: string } }
  | { action: 'markContact'; args: { person: string; date?: DateStr } }
  | { action: 'capture'; args: { text: string } };

export type ActionName = PlanStep['action'];

/** Вопросы: отвечаем сами из базы на устройстве — в ИИ данные не уходят */
export type Query =
  | { type: 'day'; date: DateStr }
  | { type: 'week'; from: DateStr }
  | { type: 'money'; from: DateStr; to: DateStr }
  | { type: 'birthdays'; days: number }
  | { type: 'search'; text: string }
  | { type: 'overdue' };

export interface Interpretation {
  /** Короткая реплика помощника (например, уточнение) */
  reply?: string;
  steps: PlanStep[];
  query?: Query;
}

// ---------- Проверка того, что пришло (особенно — от облачного ИИ) ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CURRENCIES: Currency[] = ['RUB', 'TJS', 'USD'];
const MAX_STEPS = 10;

const str = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const date = (v: unknown): DateStr | undefined => (typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const time = (v: unknown): TimeStr | undefined => {
  if (typeof v !== 'string') return undefined;
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const t = `${m[1].padStart(2, '0')}:${m[2]}`;
  return TIME_RE.test(t) ? t : undefined;
};
const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const currency = (v: unknown): Currency | undefined => (CURRENCIES.includes(v as Currency) ? (v as Currency) : undefined);
const category = (v: unknown, kind: 'expense' | 'income') => {
  const list = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.some((c) => c.id === v) ? (v as string) : undefined;
};
/** Убрать пустые поля, чтобы план был чистым */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Проверить один шаг: неизвестное действие или неверные аргументы → null (шаг выбрасывается) */
export function validateStep(raw: unknown): PlanStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const { action, args: a0 } = raw as { action?: unknown; args?: unknown };
  const a = (a0 && typeof a0 === 'object' ? a0 : {}) as Record<string, unknown>;
  switch (action) {
    case 'addTask': {
      const title = str(a.title); if (!title) return null;
      const p = num(a.priority, 0, 2);
      return { action, args: compact({ title, date: a.date === null ? null : date(a.date), time: time(a.time), priority: p === undefined ? undefined : (Math.round(p) as 0 | 1 | 2) }) };
    }
    case 'addEvent': {
      const title = str(a.title), d = date(a.date); if (!title || !d) return null;
      const dur = num(a.duration, 5, 24 * 60);
      return { action, args: compact({ title, date: d, start: time(a.start), duration: dur && Math.round(dur) }) };
    }
    case 'addExpense': case 'addIncome': {
      const amount = num(a.amount, 0.01, 1e9); if (!amount) return null;
      const kind = action === 'addIncome' ? 'income' : 'expense';
      return { action, args: compact({ amount, currency: currency(a.currency), category: category(a.category, kind), note: str(a.note, 200), date: date(a.date) }) } as PlanStep;
    }
    case 'moveUnfinished': {
      const from = date(a.from), to = date(a.to); if (!from || !to) return null;
      return { action, args: { from, to } };
    }
    case 'moveTask': {
      const task = str(a.task, 120); if (!task) return null;
      const d = a.date === null ? null : date(a.date); if (d === undefined) return null;
      return { action, args: compact({ task, date: d, time: time(a.time) }) };
    }
    case 'completeTask': {
      const task = str(a.task, 120); return task ? { action, args: { task } } : null;
    }
    case 'addNote': {
      const title = str(a.title, 200); if (!title) return null;
      return { action, args: compact({ title, body: str(a.body, 5000) }) };
    }
    case 'addLater': {
      const title = str(a.title, 300); if (!title) return null;
      const url = str(a.url, 2000);
      return { action, args: compact({ title, url: url && /^https?:\/\//.test(url) ? url : undefined }) };
    }
    case 'addLogEntry': {
      const text = str(a.text, 2000); return text ? { action, args: compact({ text, date: date(a.date) }) } : null;
    }
    case 'checkHabit': {
      const habit = str(a.habit, 100); return habit ? { action, args: compact({ habit, date: date(a.date) }) } : null;
    }
    case 'addWater': {
      const g = num(a.glasses, 1, 20); return g ? { action, args: { glasses: Math.round(g) } } : null;
    }
    case 'setHealth': {
      const args = compact({ date: date(a.date), sleep: num(a.sleep, 0, 24), weight: num(a.weight, 20, 400), mood: num(a.mood, 1, 5) });
      if (args.mood) args.mood = Math.round(args.mood);
      return args.sleep !== undefined || args.weight !== undefined || args.mood !== undefined ? { action, args } : null;
    }
    case 'addWorkout': {
      const kind = str(a.kind, 60), minutes = num(a.minutes, 1, 600); if (!kind || !minutes) return null;
      return { action, args: compact({ kind, minutes: Math.round(minutes), date: date(a.date) }) };
    }
    case 'addTopic': {
      const person = str(a.person, 80), text = str(a.text, 500); return person && text ? { action, args: { person, text } } : null;
    }
    case 'markContact': {
      const person = str(a.person, 80); return person ? { action, args: compact({ person, date: date(a.date) }) } : null;
    }
    case 'capture': {
      const text = str(a.text, 2000); return text ? { action, args: { text } } : null;
    }
    default:
      return null;
  }
}

export function validateQuery(raw: unknown): Query | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const q = raw as Record<string, unknown>;
  switch (q.type) {
    case 'day': { const d = date(q.date); return d ? { type: 'day', date: d } : undefined; }
    case 'week': { const d = date(q.from); return d ? { type: 'week', from: d } : undefined; }
    case 'money': { const f = date(q.from), t = date(q.to); return f && t ? { type: 'money', from: f <= t ? f : t, to: f <= t ? t : f } : undefined; }
    case 'birthdays': return { type: 'birthdays', days: Math.round(num(q.days, 1, 366) ?? 30) };
    case 'search': { const t = str(q.text, 100); return t ? { type: 'search', text: t } : undefined; }
    case 'overdue': return { type: 'overdue' };
    default: return undefined;
  }
}

/** Проверить ответ целиком. Всё лишнее и неверное отбрасывается — выполняются только известные действия. */
export function validateInterpretation(raw: unknown): Interpretation {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const steps = (Array.isArray(o.steps) ? o.steps : []).slice(0, MAX_STEPS).map(validateStep).filter((s): s is PlanStep => !!s);
  return compact({ reply: str(o.reply, 500), steps, query: validateQuery(o.query) });
}

// ---------- Поля, которые можно поправить в карточке «Изменить» ----------
export interface EditableField { key: string; label: string; type: 'text' | 'date' | 'time' | 'number' }

const F = {
  title: { key: 'title', label: 'Название', type: 'text' },
  date: { key: 'date', label: 'Дата', type: 'date' },
  time: { key: 'time', label: 'Время', type: 'time' },
  amount: { key: 'amount', label: 'Сумма', type: 'number' },
  note: { key: 'note', label: 'Комментарий', type: 'text' },
  text: { key: 'text', label: 'Текст', type: 'text' },
} satisfies Record<string, EditableField>;

export const EDITABLE: Partial<Record<ActionName, EditableField[]>> = {
  addTask: [F.title, F.date, F.time],
  addEvent: [F.title, F.date, { key: 'start', label: 'Начало', type: 'time' }, { key: 'duration', label: 'Минут', type: 'number' }],
  addExpense: [F.amount, F.note, F.date],
  addIncome: [F.amount, F.note, F.date],
  moveUnfinished: [{ key: 'to', label: 'На дату', type: 'date' }],
  moveTask: [{ key: 'task', label: 'Задача', type: 'text' }, F.date],
  completeTask: [{ key: 'task', label: 'Задача', type: 'text' }],
  addNote: [F.title, { key: 'body', label: 'Текст', type: 'text' }],
  addLater: [F.title],
  addLogEntry: [F.text, F.date],
  checkHabit: [{ key: 'habit', label: 'Привычка', type: 'text' }],
  addWater: [{ key: 'glasses', label: 'Стаканов', type: 'number' }],
  setHealth: [{ key: 'sleep', label: 'Сон, ч', type: 'number' }, { key: 'weight', label: 'Вес, кг', type: 'number' }, { key: 'mood', label: 'Настроение 1–5', type: 'number' }],
  addWorkout: [{ key: 'kind', label: 'Тренировка', type: 'text' }, { key: 'minutes', label: 'Минут', type: 'number' }],
  addTopic: [{ key: 'person', label: 'С кем', type: 'text' }, F.text],
  markContact: [{ key: 'person', label: 'С кем', type: 'text' }],
  capture: [F.text],
};

/** Поменять поле шага и заново проверить (неверное значение → шаг не меняется) */
export function editStep(step: PlanStep, key: string, value: string): PlanStep {
  const field = EDITABLE[step.action]?.find((f) => f.key === key);
  let v: unknown = value.trim() === '' ? undefined : value;
  if (field?.type === 'number' && v !== undefined) v = Number(String(v).replace(',', '.'));
  const next = validateStep({ action: step.action, args: { ...step.args, [key]: v } });
  return next ?? step;
}
