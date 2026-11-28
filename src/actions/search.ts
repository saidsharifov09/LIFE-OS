// Поиск по всему приложению. Только чтение — ничего не меняет.
// Используется страницей «Поиск» и позже ИИ-чатом («найди заметку про…»).
import { db } from '@/db/db';
import type { BaseRecord, DateStr } from '@/db/types';
import { findCategory } from '@/lib/categories';
import { fmtMoney } from '@/lib/format';
import { fmtDay } from '@/lib/dates';
import { scoreMatch, snippet, tokenize, type SearchFields } from '@/lib/search';
import { alive } from './core';

export type SearchKind =
  | 'task' | 'event' | 'note' | 'later' | 'person' | 'log' | 'inbox'
  | 'transaction' | 'goal' | 'habit' | 'debt' | 'recurring' | 'savings' | 'account';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** Короткая подпись: дата, сумма, раздел… */
  meta?: string;
  /** Фрагмент текста с найденным словом */
  snippet?: string;
  /** Куда перейти (маршрут приложения, HashRouter) */
  path: string;
  /** Выполнено / в архиве — показывается приглушённо */
  dim?: boolean;
  score: number;
  /** Для сортировки при равной оценке: новее — выше */
  updatedAt: number;
}

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  task: 'Задачи', event: 'События', note: 'Заметки', later: 'Посмотреть позже', person: 'Люди',
  log: 'История', inbox: 'Входящие', transaction: 'Операции', goal: 'Цели', habit: 'Привычки',
  debt: 'Долги', recurring: 'Регулярные платежи', savings: 'Копилки', account: 'Счета',
};

/** Порядок групп в выдаче */
export const SEARCH_KIND_ORDER: SearchKind[] = [
  'task', 'event', 'note', 'person', 'later', 'goal', 'habit', 'log', 'inbox',
  'transaction', 'recurring', 'debt', 'savings', 'account',
];

interface Source<T extends BaseRecord> {
  kind: SearchKind;
  table: string;
  fields: (r: T) => SearchFields;
  title: (r: T) => string;
  meta?: (r: T) => string | undefined;
  path: (r: T) => string;
  dim?: (r: T) => boolean;
}

const enc = encodeURIComponent;
const day = (d?: DateStr | null) => (d ? fmtDay(d) : undefined);
const join = (...p: (string | number | null | undefined | false)[]) => p.filter((x) => x !== undefined && x !== null && x !== false && x !== '').join(' · ');
/** Сумма в нескольких видах: «1250», «1 250», «1250,5» — чтобы находилось как ни напиши */
const amountText = (n: number) => `${n} ${String(n).replace('.', ',')} ${n.toLocaleString('ru-RU')}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SOURCES: Source<any>[] = [
  {
    kind: 'task', table: 'tasks',
    fields: (t) => ({ title: t.title, text: [t.notes, ...(t.subtasks ?? []).map((s: { title: string }) => s.title), findCategory(t.category, 'task')?.name].join(' ') }),
    title: (t) => t.title,
    meta: (t) => join(t.done ? 'выполнена' : undefined, day(t.date), t.time),
    path: (t) => `/tasks?open=${enc(t.id)}`,
    dim: (t) => t.done,
  },
  {
    kind: 'event', table: 'events',
    fields: (e) => ({ title: e.title, text: e.notes }),
    title: (e) => e.title,
    meta: (e) => join(day(e.date), e.start ?? 'весь день', e.recurrence ? 'повторяется' : undefined),
    path: (e) => `/calendar?date=${e.date}&open=${enc(e.id)}`,
  },
  {
    kind: 'note', table: 'notes',
    fields: (n) => ({ title: n.title || n.body.split('\n')[0] || '', text: `${n.body} ${(n.tags ?? []).join(' ')}` }),
    title: (n) => n.title || n.body.split('\n')[0] || 'Без названия',
    meta: (n) => join(n.archived ? 'в архиве' : undefined, (n.tags ?? []).map((t: string) => '#' + t).join(' ')),
    path: (n) => `/notes?open=${enc(n.id)}`,
    dim: (n) => n.archived,
  },
  {
    kind: 'later', table: 'later',
    fields: (l) => ({ title: l.title, text: `${l.url ?? ''} ${l.note ?? ''}` }),
    title: (l) => l.title,
    meta: (l) => join(l.done ? 'просмотрено' : undefined, l.url ? safeHost(l.url) : undefined),
    path: (l) => `/later?open=${enc(l.id)}`,
    dim: (l) => l.done,
  },
  {
    kind: 'person', table: 'people',
    fields: (p) => ({ title: p.name, text: [p.relation, p.phone, p.notes, ...(p.topics ?? []).map((t: { text: string }) => t.text)].join(' ') }),
    title: (p) => `${p.emoji ? p.emoji + ' ' : ''}${p.name}`,
    meta: (p) => p.relation,
    path: (p) => `/people?open=${enc(p.id)}`,
  },
  {
    kind: 'log', table: 'log',
    fields: (l) => ({ title: l.text, text: '' }),
    title: (l) => l.text.split('\n')[0],
    meta: (l) => join(day(l.date), l.time),
    path: (l) => `/log?date=${l.date}&open=${enc(l.id)}`,
  },
  {
    kind: 'inbox', table: 'inbox',
    fields: (i) => ({ title: i.text }),
    title: (i) => i.text,
    meta: (i) => (i.processed ? 'разобрано' : 'ждёт разбора'),
    path: () => '/inbox',
    dim: (i) => i.processed,
  },
  {
    kind: 'transaction', table: 'transactions',
    fields: (t) => ({
      title: t.note || findCategory(t.category, t.type === 'income' ? 'income' : 'expense')?.name || '',
      text: `${amountText(t.amount)} ${findCategory(t.category, t.type === 'income' ? 'income' : 'expense')?.name ?? ''} ${t.type === 'transfer' ? 'перевод' : ''}`,
    }),
    title: (t) => t.note || findCategory(t.category, t.type === 'income' ? 'income' : 'expense')?.name || (t.type === 'transfer' ? 'Перевод' : 'Операция'),
    meta: (t) => join((t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '') + fmtMoney(t.amount, t.currency), day(t.date)),
    path: (t) => `/finance?tab=ops&open=${enc(t.id)}`,
  },
  {
    kind: 'goal', table: 'goals',
    fields: (g) => ({ title: g.title, text: [g.why, ...(g.milestones ?? []).map((m: { title: string }) => m.title)].join(' ') }),
    title: (g) => `${g.emoji ? g.emoji + ' ' : ''}${g.title}`,
    meta: (g) => join(g.done ? 'достигнута' : undefined, g.deadline ? 'до ' + fmtDay(g.deadline) : undefined),
    path: (g) => `/goals?open=${enc(g.id)}`,
    dim: (g) => g.done || g.archived,
  },
  {
    kind: 'habit', table: 'habits',
    fields: (h) => ({ title: h.title }),
    title: (h) => `${h.emoji} ${h.title}`,
    meta: (h) => (h.archived ? 'в архиве' : undefined),
    path: (h) => `/goals?habit=${enc(h.id)}`,
    dim: (h) => h.archived,
  },
  {
    kind: 'debt', table: 'debts',
    fields: (d) => ({ title: d.person, text: `${d.note ?? ''} ${amountText(d.amount)} ${d.direction === 'they_owe' ? 'мне должны' : 'я должен'}` }),
    title: (d) => d.person,
    meta: (d) => join(d.direction === 'they_owe' ? 'мне должны' : 'я должен', fmtMoney(d.amount - d.paid, d.currency), d.closed ? 'закрыт' : undefined),
    path: () => '/finance?tab=debts',
    dim: (d) => d.closed,
  },
  {
    kind: 'recurring', table: 'recurring',
    fields: (r) => ({ title: r.title, text: amountText(r.amount) }),
    title: (r) => r.title,
    meta: (r) => join(fmtMoney(r.amount, r.currency), r.nextDate ? 'след. ' + fmtDay(r.nextDate) : undefined, r.active ? undefined : 'на паузе'),
    path: () => '/finance?tab=recurring',
    dim: (r) => !r.active,
  },
  {
    kind: 'savings', table: 'savings',
    fields: (s) => ({ title: s.name, text: amountText(s.target) }),
    title: (s) => s.name,
    meta: (s) => `${fmtMoney(s.saved, s.currency)} из ${fmtMoney(s.target, s.currency)}`,
    path: () => '/finance?tab=savings',
    dim: (s) => s.closed,
  },
  {
    kind: 'account', table: 'accounts',
    fields: (a) => ({ title: a.name }),
    title: (a) => a.name,
    meta: (a) => (a.archived ? 'в архиве' : undefined),
    path: () => '/finance',
    dim: (a) => a.archived,
  },
];

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return undefined; }
}

export interface SearchOptions {
  /** Сколько результатов максимум в одной группе (по умолчанию 30) */
  perKind?: number;
  /** Искать только в этих видах */
  kinds?: SearchKind[];
}

/**
 * Найти по всему приложению. Ищет все слова запроса (порядок не важен, регистр и «ё» тоже,
 * окончания русских слов — примерно). Удалённые в корзину записи не попадают.
 */
export async function searchAll(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const perKind = opts.perKind ?? 30;
  const out: SearchHit[] = [];
  for (const src of SOURCES) {
    if (opts.kinds && !opts.kinds.includes(src.kind)) continue;
    const rows = (await db.table(src.table).toArray()) as BaseRecord[];
    const hits: SearchHit[] = [];
    for (const r of rows) {
      if (!alive(r)) continue;
      const f = src.fields(r);
      let score = scoreMatch(tokens, f);
      if (!score) continue;
      const dim = src.dim?.(r) ?? false;
      if (dim) score -= 5; // выполненное и архив — ниже актуального
      const title = src.title(r);
      const snip = snippet(f.text, tokens);
      hits.push({
        kind: src.kind, id: r.id, title, meta: src.meta?.(r) || undefined,
        // Фрагмент показываем, только если совпадение в тексте, а не в названии
        snippet: snip && !scoreMatch(tokens, { title }) ? snip : undefined,
        path: src.path(r), dim, score, updatedAt: r.updatedAt ?? 0,
      });
    }
    hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
    out.push(...hits.slice(0, perKind));
  }
  return out;
}

/** Сгруппировать результаты по виду в порядке SEARCH_KIND_ORDER; группы — по лучшему совпадению не сортируем, порядок постоянный */
export function groupHits(hits: SearchHit[]): { kind: SearchKind; label: string; items: SearchHit[] }[] {
  return SEARCH_KIND_ORDER
    .map((kind) => ({ kind, label: SEARCH_KIND_LABEL[kind], items: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length);
}
