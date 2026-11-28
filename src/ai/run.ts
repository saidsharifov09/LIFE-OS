// Помощник на устройстве: поиск людей/привычек/задач по имени, описание шагов для карточки «Что я сделаю»,
// выполнение подтверждённого плана одним отменяемым действием и ответы на вопросы из локальной базы.
import { db } from '@/db/db';
import type { DateStr, Habit, Person, Task } from '@/db/types';
import {
  addEvent, addExpense, addIncome, addLater, addLogEntry, addNote, addTask, addTopic, addWater, addWorkout, alive, capture,
  checkHabit, completeTask, getDay, getHealth, getRates, lastUndo, markContact, moveTask, moveUnfinished, runAction,
  searchAll, setHealth, sortTasks, upcomingBirthdays, eventsInRange,
} from '@/actions';
import { findCategory } from '@/lib/categories';
import { addDays, fmtDay, fmtRelative, today, WEEKDAYS_SHORT, weekday } from '@/lib/dates';
import { byCategory, totals } from '@/lib/finance';
import { fmtMoney, plural } from '@/lib/format';
import { normalize, scoreMatch, tokenize } from '@/lib/search';
import type { PlanStep, Query } from './plan';

// ---------- Поиск по имени ----------
/** Основа слова: «Зарина» → «зарин», «мама» → «мам» (чтобы «с Зариной», «маме» находили человека) */
function stem(w: string): string {
  const n = normalize(w);
  return n.length > 3 ? n.replace(/(ой|ей|ою|ею|ом|ем|ам|ям|ах|ях|а|я|у|ю|е|и|ы|о|ь)$/, '') : n;
}

/** Найти человека по слову из фразы (любой падеж, по имени или по «кто это») */
export function matchPerson(word: string, people: Person[]): Person | undefined {
  const w = stem(word);
  if (w.length < 2) return undefined;
  const score = (p: Person) => {
    const names = [p.name, ...(p.relation ? [p.relation] : [])].flatMap((n) => n.split(/\s+/));
    return Math.max(0, ...names.map((n) => (normalize(n) === normalize(word) ? 3 : stem(n) === w ? 2 : stem(n).startsWith(w) || w.startsWith(stem(n)) && stem(n).length >= 3 ? 1 : 0)));
  };
  return people.map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (b.p.favorite ? 1 : 0) - (a.p.favorite ? 1 : 0))[0]?.p;
}

/** Люди, упомянутые в тексте («был в парке с Али и мамой») */
export function peopleInText(text: string, people: Person[]): Person[] {
  const words = tokenize(text).filter((w) => w.length >= 3 || /^[а-я]{3}$/.test(w));
  const found = new Map<string, Person>();
  for (const w of words) {
    const p = people.find((pp) => pp.name.split(/\s+/).some((n) => normalize(n) === w || (stem(n).length >= 3 && stem(w) === stem(n))));
    if (p) found.set(p.id, p);
  }
  return [...found.values()];
}

function bestByTitle<T extends { title: string }>(query: string, list: T[]): T | undefined {
  const tokens = tokenize(query);
  return list.map((x) => ({ x, s: scoreMatch(tokens, { title: x.title }) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s)[0]?.x;
}

// ---------- Подготовка шагов к показу ----------
export interface ResolvedStep {
  step: PlanStep;
  /** Иконка/вид для карточки */
  kind: 'task' | 'event' | 'expense' | 'income' | 'move' | 'note' | 'later' | 'log' | 'habit' | 'health' | 'person' | 'inbox';
  /** Человеческое описание: «Задача «Купить хлеб» · завтра» */
  text: string;
  /** Найденная запись (человек, привычка, задача) */
  refId?: string;
  /** Люди для записи в историю */
  personIds?: string[];
  /** Почему шаг нельзя выполнить (не нашёл человека и т. п.) — такой шаг пропускается */
  problem?: string;
}

const when = (date?: DateStr | null, time?: string | null) =>
  [date ? fmtRelative(date).toLowerCase() : 'без даты', time].filter(Boolean).join(' в ');

interface Lookups { people: Person[]; habits: Habit[]; tasks: Task[] }

async function lookups(): Promise<Lookups> {
  return {
    people: (await db.people.toArray()).filter(alive),
    habits: (await db.habits.toArray()).filter((h) => alive(h) && !h.archived),
    tasks: (await db.tasks.toArray()).filter((t) => alive(t) && !t.done),
  };
}

export function describeStep(step: PlanStep, l: Lookups): ResolvedStep {
  const a = step.args as Record<string, unknown>;
  switch (step.action) {
    case 'addTask':
      return { step, kind: 'task', text: `Задача «${step.args.title}» · ${when(step.args.date, step.args.time)}${step.args.priority === 2 ? ' · важная' : ''}` };
    case 'addEvent':
      return { step, kind: 'event', text: `Событие «${step.args.title}» · ${when(step.args.date, step.args.start ?? undefined)}${step.args.start ? '' : ' (весь день)'}${step.args.duration && step.args.start ? ` · ${step.args.duration} мин` : ''}` };
    case 'addExpense': case 'addIncome': {
      const inc = step.action === 'addIncome';
      const cat = findCategory(step.args.category, inc ? 'income' : 'expense')?.name;
      return { step, kind: inc ? 'income' : 'expense', text: `${inc ? 'Доход' : 'Расход'} ${fmtMoney(step.args.amount, step.args.currency ?? 'RUB')}${cat ? ` · ${cat}` : ''}${step.args.note && normalize(step.args.note) !== normalize(cat ?? '') ? ` · «${step.args.note}»` : ''}${step.args.date ? ` · ${fmtRelative(step.args.date).toLowerCase()}` : ''}` };
    }
    case 'moveUnfinished': {
      const n = l.tasks.filter((t) => t.date && t.date <= step.args.from).length;
      return { step, kind: 'move', text: `Перенести невыполненное (${n} ${plural(n, ['задача', 'задачи', 'задач'])}) на ${fmtRelative(step.args.to).toLowerCase()}`, problem: n ? undefined : 'Невыполненных задач с датой нет — переносить нечего' };
    }
    case 'moveTask': {
      const t = bestByTitle(step.args.task, l.tasks);
      return t
        ? { step, kind: 'move', refId: t.id, text: `Перенести «${t.title}» на ${when(step.args.date, step.args.time)}` }
        : { step, kind: 'move', text: `Перенести «${step.args.task}»`, problem: `Не нашёл невыполненную задачу «${step.args.task}»` };
    }
    case 'completeTask': {
      const t = bestByTitle(step.args.task, l.tasks);
      return t
        ? { step, kind: 'task', refId: t.id, text: `Отметить выполненной «${t.title}»` }
        : { step, kind: 'task', text: `Выполнить «${step.args.task}»`, problem: `Не нашёл невыполненную задачу «${step.args.task}»` };
    }
    case 'checkHabit': {
      const h = bestByTitle(step.args.habit, l.habits);
      if (h) return { step, kind: 'habit', refId: h.id, text: `Отметить привычку ${h.emoji} «${h.title}»${step.args.date ? ` · ${fmtRelative(step.args.date).toLowerCase()}` : ''}` };
      // «сделал …» может быть задачей
      const t = bestByTitle(step.args.habit, l.tasks);
      if (t) return describeStep({ action: 'completeTask', args: { task: t.title } }, l);
      return { step, kind: 'habit', text: `Отметить «${step.args.habit}»`, problem: `Не нашёл привычку или задачу «${step.args.habit}»` };
    }
    case 'addNote':
      return { step, kind: 'note', text: `Заметка «${step.args.title}»${step.args.body ? ' + текст' : ''} в блокнот` };
    case 'addLater':
      return { step, kind: 'later', text: `В «Посмотреть позже»: «${step.args.title}»` };
    case 'addLogEntry': {
      const ps = peopleInText(step.args.text, l.people);
      return { step, kind: 'log', personIds: ps.map((p) => p.id), text: `В историю${step.args.date ? ` (${fmtRelative(step.args.date).toLowerCase()})` : ''}: «${step.args.text}»${ps.length ? ` · с кем: ${ps.map((p) => p.name).join(', ')}` : ''}` };
    }
    case 'addWater':
      return { step, kind: 'health', text: `Вода: +${step.args.glasses} ${plural(step.args.glasses, ['стакан', 'стакана', 'стаканов'])}` };
    case 'setHealth': {
      const parts = [a.sleep !== undefined && `сон ${a.sleep} ч`, a.weight !== undefined && `вес ${a.weight} кг`, a.mood !== undefined && `настроение ${a.mood}/5`].filter(Boolean);
      return { step, kind: 'health', text: `Здоровье${step.args.date ? ` (${fmtRelative(step.args.date).toLowerCase()})` : ''}: ${parts.join(', ')}` };
    }
    case 'addWorkout':
      return { step, kind: 'health', text: `Тренировка «${step.args.kind}» · ${step.args.minutes} мин` };
    case 'addTopic': case 'markContact': {
      const p = matchPerson(step.args.person, l.people);
      const label = step.action === 'addTopic' ? `Обсудить с ${p?.name ?? step.args.person}: «${step.args.text}»` : `Отметить контакт с ${p?.name ?? step.args.person}`;
      return p ? { step, kind: 'person', refId: p.id, text: label } : { step, kind: 'person', text: label, problem: `Нет «${step.args.person}» в разделе «Люди» — добавьте человека и повторите` };
    }
    case 'capture':
      return { step, kind: 'inbox', text: `Во «Входящие»: «${step.args.text}»` };
  }
}

export async function resolvePlan(steps: PlanStep[]): Promise<ResolvedStep[]> {
  const l = await lookups();
  return steps.map((s) => describeStep(s, l));
}

// ---------- Выполнение ----------
async function runStep(r: ResolvedStep) {
  const s = r.step;
  switch (s.action) {
    case 'addTask': return addTask({ title: s.args.title, date: s.args.date ?? null, time: s.args.time ?? null, priority: s.args.priority ?? 0 });
    case 'addEvent': return addEvent({ title: s.args.title, date: s.args.date, start: s.args.start ?? null, duration: s.args.duration ?? 60 });
    case 'addExpense': return addExpense({ amount: s.args.amount, currency: s.args.currency, category: s.args.category, note: s.args.note ?? '', date: s.args.date });
    case 'addIncome': return addIncome({ amount: s.args.amount, currency: s.args.currency, category: s.args.category, note: s.args.note ?? '', date: s.args.date });
    case 'moveUnfinished': return moveUnfinished(s.args.from, s.args.to);
    case 'moveTask': return r.refId && moveTask(r.refId, s.args.date, s.args.time);
    case 'completeTask': return r.refId && completeTask(r.refId, true);
    case 'checkHabit': {
      if (!r.refId) return;
      const date = s.args.date ?? today();
      const h = await db.habits.get(r.refId);
      const cur = await db.habitChecks.get(`${r.refId}_${date}`);
      const was = cur && !cur.deletedAt ? cur.count : 0;
      // «сделал» — только добавляем отметку, не снимаем её (в отличие от касания в списке)
      return checkHabit(r.refId, date, Math.min(h?.target ?? 1, was + 1));
    }
    case 'addNote': return addNote({ title: s.args.title, body: s.args.body });
    case 'addLater': return addLater({ title: s.args.title, url: s.args.url });
    case 'addLogEntry': return addLogEntry({ text: s.args.text, date: s.args.date, personIds: r.personIds });
    case 'addWater': return addWater(s.args.glasses);
    case 'setHealth': {
      const date = s.args.date ?? today();
      const { sleep, weight, mood } = s.args;
      await getHealth(date);
      return setHealth(date, { ...(sleep !== undefined ? { sleep } : {}), ...(weight !== undefined ? { weight } : {}), ...(mood !== undefined ? { mood: mood as 1 | 2 | 3 | 4 | 5 } : {}) });
    }
    case 'addWorkout': return addWorkout({ kind: s.args.kind, minutes: s.args.minutes, date: s.args.date });
    case 'addTopic': return r.refId && addTopic(r.refId, s.args.text);
    case 'markContact': return r.refId && markContact(r.refId, s.args.date);
    case 'capture': return capture(s.args.text);
  }
}

/**
 * Выполнить подтверждённые шаги одним действием: «Отменить» откатывает весь план.
 * Шаги с problem пропускаются. Возвращает число выполненных и метку отмены (чтобы отменять именно этот план).
 */
export async function executePlan(items: ResolvedStep[], label = 'Помощник'): Promise<{ done: number; undoAt: number | null }> {
  const ok = items.filter((i) => !i.problem);
  if (!ok.length) return { done: 0, undoAt: null };
  await runAction(`${label}: ${ok.length} ${plural(ok.length, ['действие', 'действия', 'действий'])}`, async () => {
    for (const i of ok) await runStep(i);
  });
  return { done: ok.length, undoAt: lastUndo()?.at ?? null };
}

// ---------- Ответы на вопросы (только чтение, из базы на устройстве) ----------
export interface AnswerLine { text: string; sub?: string; path?: string; done?: boolean }
export interface Answer { title: string; lines: AnswerLine[]; empty?: string; footer?: string }

export async function answerQuery(q: Query): Promise<Answer> {
  switch (q.type) {
    case 'day': {
      const d = await getDay(q.date);
      const lines: AnswerLine[] = [
        ...d.events.map((e) => ({ text: e.event.title, sub: e.event.start ?? 'весь день', path: `/calendar?open=${e.event.id}&date=${q.date}` })),
        ...d.tasks.map((t) => ({ text: t.title, sub: t.time ? `задача · ${t.time}` : 'задача', path: `/tasks?open=${t.id}`, done: t.done })),
      ].sort((a, b) => (a.sub ?? '').localeCompare(b.sub ?? ''));
      const extra = d.overdue.length ? `Ещё просрочено: ${d.overdue.length} — спросите «что просрочено?»` : undefined;
      const money = q.date === today() && d.money.spentToday ? `Потрачено сегодня: ${fmtMoney(d.money.spentToday)}` : undefined;
      return { title: `${fmtRelative(q.date)} · ${fmtDay(q.date)}`, lines, empty: 'Ничего не запланировано — свободный день.', footer: [extra, money].filter(Boolean).join(' · ') || undefined };
    }
    case 'week': {
      const to = addDays(q.from, 6);
      const tasks = (await db.tasks.toArray()).filter((t) => alive(t) && !t.done && t.date && t.date >= q.from && t.date <= to);
      const events = await eventsInRange(q.from, to);
      const lines: AnswerLine[] = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(q.from, i);
        const ev = events.filter((e) => e.date === day).map((e) => `${e.event.start ? e.event.start + ' ' : ''}${e.event.title}`);
        const tk = tasks.filter((t) => t.date === day).sort(sortTasks).map((t) => t.title);
        if (!ev.length && !tk.length) continue;
        lines.push({ text: `${WEEKDAYS_SHORT[weekday(day)]}, ${fmtDay(day)}`, sub: [...ev, ...tk].slice(0, 4).join(' · ') + (ev.length + tk.length > 4 ? ' …' : ''), path: `/calendar?date=${day}` });
      }
      return { title: `Неделя ${fmtDay(q.from)} — ${fmtDay(to)}`, lines, empty: 'На этой неделе ничего не запланировано.' };
    }
    case 'overdue': {
      const base = today();
      const list = (await db.tasks.toArray()).filter((t) => alive(t) && !t.done && t.date && t.date < base).sort(sortTasks);
      return {
        title: 'Просрочено', lines: list.slice(0, 15).map((t) => ({ text: t.title, sub: fmtRelative(t.date!), path: `/tasks?open=${t.id}` })),
        empty: 'Просроченных задач нет 🎉', footer: list.length ? 'Можно написать «перенеси невыполненное на завтра».' : undefined,
      };
    }
    case 'money': {
      const rates = await getRates();
      const txs = (await db.transactions.toArray()).filter(alive);
      const t = totals(txs, q.from, q.to, rates);
      const cats = byCategory(txs, q.from, q.to, rates).slice(0, 6);
      const period = q.from === q.to ? fmtRelative(q.from) : `${fmtDay(q.from)} — ${fmtDay(q.to)}`;
      return {
        title: `Деньги · ${period}`,
        lines: [
          { text: `Расходы: ${fmtMoney(t.expense)}`, path: '/finance' },
          { text: `Доходы: ${fmtMoney(t.income)}`, path: '/finance' },
          ...cats.map((c) => ({ text: findCategory(c.category)?.name ?? c.category, sub: fmtMoney(c.amount) })),
        ],
        footer: 'Суммы в рублях по курсам из «Финансы → Настройки».',
      };
    }
    case 'birthdays': {
      const list = await upcomingBirthdays(q.days);
      return {
        title: `Дни рождения · ${q.days} дн.`,
        lines: list.map(({ person, next }) => ({ text: person.name, sub: `${next.daysLeft === 0 ? 'сегодня' : fmtRelative(next.date).toLowerCase()}${next.age ? ` · ${next.age}` : ''}`, path: `/people?open=${person.id}` })),
        empty: 'В ближайшие дни дней рождения нет.',
      };
    }
    case 'search': {
      const hits = (await searchAll(q.text, { perKind: 5 })).sort((a, b) => b.score - a.score).slice(0, 8);
      return { title: `Поиск: «${q.text}»`, lines: hits.map((h) => ({ text: h.title, sub: h.meta, path: h.path, done: h.dim })), empty: 'Ничего не нашёл.', footer: hits.length ? undefined : 'Попробуйте другое слово или откройте поиск.' };
    }
  }
}
