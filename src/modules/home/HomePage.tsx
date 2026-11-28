// Главная «Мой день»: дашборд из виджетов. Порядок виджетов хранится в настройках (настройка — Этап 7).
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence } from 'framer-motion';
import {
  AlarmClock, ArrowRight, CalendarClock, CalendarDays, Inbox, ListTodo, Moon, Quote, Sparkles,
  Star, Sunrise, Target, Wallet, Calculator,
} from 'lucide-react';
import { db } from '@/db/db';
import type { Task } from '@/db/types';
import { alive, getDay, getReview, moveUnfinished, type DayView } from '@/actions';
import { addDays, fmtDayLong, fmtRelative, minToTime, nowTime, timeToMin, today } from '@/lib/dates';
import { cx, fmtMoney, plural } from '@/lib/format';
import { findCategory } from '@/lib/categories';
import { QuickMoney } from '@/modules/finance/QuickMoney';
import { Button, Card, Empty } from '@/ui/primitives';
import { Bar, Ring } from '@/ui/feedback';
import { useToast } from '@/ui/overlay';
import { TaskItem } from '@/modules/tasks/TaskItem';
import { TaskEditor } from '@/modules/tasks/TaskEditor';
import { useCapture } from '@/modules/capture/CaptureSheet';
import { quoteOfDay } from './quotes';
import { BackupBanner } from '@/modules/backup/BackupBanner';
import { HabitsWidget, HealthWidget } from './LifeWidgets';
import { SyncBadge } from '@/modules/sync/SyncBadge';
import { PeopleWidget } from '@/modules/people/PeopleWidget';

export const DEFAULT_WIDGETS = ['review', 'progress', 'top', 'tasks', 'habits', 'health', 'schedule', 'next', 'money', 'people', 'inbox', 'quote'] as const;
export type WidgetId = (typeof DEFAULT_WIDGETS)[number];

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 17) return 'Добрый день';
  if (h >= 17 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

/** Текущее время, обновляется раз в минуту */
function useNow() {
  const [t, setT] = useState(nowTime());
  useEffect(() => { const id = setInterval(() => setT(nowTime()), 30000); return () => clearInterval(id); }, []);
  return t;
}

export default function HomePage() {
  const date = today();
  const now = useNow();
  // Перечитываем день при любом изменении задач/событий/операций
  const day = useLiveQuery(() => getDay(date), [date, now]);
  const order = useLiveQuery(async () => {
    const saved = (await db.settings.get('homeWidgets'))?.value as WidgetId[] | undefined;
    if (!saved) return [...DEFAULT_WIDGETS];
    // Новые виджеты (появились в обновлении) добавляем в конец сохранённого порядка
    return [...saved, ...DEFAULT_WIDGETS.filter((w) => !saved.includes(w))];
  }, []);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  if (!day || !order) return <div className="h-40" />;

  const widgets: Record<WidgetId, ReactNode> = {
    review: <ReviewBanner key="review" />,
    progress: <ProgressWidget key="progress" day={day} />,
    top: <TopWidget key="top" day={day} onOpen={setEditing} />,
    tasks: <TasksWidget key="tasks" day={day} onOpen={setEditing} onAdd={() => setCreating(true)} />,
    schedule: <ScheduleWidget key="schedule" day={day} now={now} />,
    next: <NextWidget key="next" day={day} now={now} />,
    money: <MoneyWidget key="money" day={day} />,
    people: <PeopleWidget key="people" />,
    inbox: <InboxWidget key="inbox" />,
    habits: <HabitsWidget key="habits" />,
    health: <HealthWidget key="health" />,
    quote: <QuoteWidget key="quote" date={date} />,
  };

  return (
    <>
      <header className="mb-5 pt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted">{fmtDayLong(date)}</p>
          <SyncBadge link className="lg:hidden" />
        </div>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-4xl">
          {greeting()}<span className="grad-text">!</span>
        </h1>
      </header>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BackupBanner />
        {order.filter((id) => id in widgets).map((id) => widgets[id])}
      </div>
      <TaskEditor open={!!editing || creating} task={editing} defaultDate={date} onClose={() => { setEditing(null); setCreating(false); }} />
    </>
  );
}

// ---------- Виджеты ----------

function ReviewBanner() {
  const h = new Date().getHours();
  const kind = h < 13 ? 'morning' : h >= 18 ? 'evening' : null;
  const done = useLiveQuery(async () => (kind ? !!(await getReview(kind)) : true), [kind]);
  if (!kind || done !== false) return null;
  const morning = kind === 'morning';
  return (
    <Link to={`/review/${kind}`} className="focus-ring block rounded-3xl md:col-span-2 xl:col-span-3">
      <Card className="flex items-center gap-4 !bg-gradient-to-r from-sky-500/20 via-teal-500/15 to-emerald-500/20">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-accent-teal">
          {morning ? <Sunrise size={26} /> : <Moon size={24} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{morning ? 'Утренний обзор' : 'Вечерний отчёт'}</p>
          <p className="text-sm text-muted">{morning ? '2 минуты: выбрать 3 главных дела и спланировать день' : 'Подвести итоги и перенести недоделанное в один тап'}</p>
        </div>
        <ArrowRight size={20} className="shrink-0 text-muted" />
      </Card>
    </Link>
  );
}

function ProgressWidget({ day }: { day: DayView }) {
  const { done, total, percent } = day.progress;
  const left = total - done;
  return (
    <Card title="Прогресс дня" icon={<Target size={18} />}>
      <div className="flex items-center gap-5">
        <Ring value={percent} size={104} stroke={11}>
          <div>
            <div className="text-2xl font-bold tabular-nums">{percent}%</div>
            <div className="text-[11px] text-muted">{done}/{total}</div>
          </div>
        </Ring>
        <div className="space-y-1.5 text-sm">
          <p className="text-base font-semibold">
            {total === 0 ? 'Задач на сегодня нет' : left === 0 ? 'Всё сделано! 🎉' : `Осталось ${left} ${plural(left, ['задача', 'задачи', 'задач'])}`}
          </p>
          {day.overdue.length > 0 && <p className="font-medium text-red-500 dark:text-red-400">Просрочено: {day.overdue.length}</p>}
          <p className="text-muted">Событий: {day.events.length}</p>
        </div>
      </div>
    </Card>
  );
}

function TopWidget({ day, onOpen }: { day: DayView; onOpen: (t: Task) => void }) {
  return (
    <Card title="3 главных дела" icon={<Star size={18} />} action={<Link to="/review/morning" className="text-sm text-sky-600 dark:text-sky-300">Выбрать</Link>}>
      {day.top.length === 0 ? (
        <p className="text-sm text-muted">Отметьте до трёх задач звёздочкой в утреннем обзоре или в карточке задачи. Остальное — бонус.</p>
      ) : (
        <ul><AnimatePresence initial={false}>{day.top.map((t) => <TaskItem key={t.id} task={t} onOpen={onOpen} />)}</AnimatePresence></ul>
      )}
    </Card>
  );
}

function TasksWidget({ day, onOpen, onAdd }: { day: DayView; onOpen: (t: Task) => void; onAdd: () => void }) {
  const toast = useToast();
  const list = [...day.overdue, ...day.tasks];
  const active = list.filter((t) => !t.done);
  const doneList = list.filter((t) => t.done);
  return (
    <Card
      title="Задачи на сегодня"
      icon={<ListTodo size={18} />}
      className="md:row-span-2"
      action={<Button size="sm" variant="ghost" onClick={onAdd}>+ Добавить</Button>}
    >
      {day.overdue.length > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm">
          <AlarmClock size={16} className="text-red-500 dark:text-red-400" />
          <span className="flex-1">Просрочено: {day.overdue.length}</span>
          <button className="font-semibold text-sky-600 dark:text-sky-300" onClick={async () => {
            const n = await moveUnfinished(addDays(today(), -1), today());
            toast.show(`На сегодня: ${n}`, { undo: true });
          }}>Всё на сегодня</button>
        </div>
      )}
      {list.length === 0 ? (
        <Empty icon={<Sparkles size={24} />} title="Свободный день" hint="Добавьте задачу или загляните в «Входящие»." />
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {active.map((t) => <TaskItem key={t.id} task={t} onOpen={onOpen} showDate={t.date !== today()} />)}
            {doneList.map((t) => <TaskItem key={t.id} task={t} onOpen={onOpen} showDate={false} compact />)}
          </AnimatePresence>
        </ul>
      )}
      <Link to="/tasks" className="mt-2 flex items-center gap-1 px-2 text-sm text-muted hover:text-fg">Все задачи <ArrowRight size={14} /></Link>
    </Card>
  );
}

interface Slot { time: string; end?: string; title: string; color: string; kind: 'event' | 'task'; done?: boolean }

function slotsOf(day: DayView): Slot[] {
  const slots: Slot[] = [];
  for (const o of day.events) {
    if (!o.event.start) continue;
    slots.push({ time: o.event.start, end: minToTime(timeToMin(o.event.start) + o.event.duration), title: o.event.title, color: o.event.color, kind: 'event' });
  }
  for (const t of day.tasks) if (t.time) slots.push({ time: t.time, title: t.title, color: '#2dd4bf', kind: 'task', done: t.done });
  return slots.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
}

function ScheduleWidget({ day, now }: { day: DayView; now: string }) {
  const slots = slotsOf(day);
  const allDay = day.events.filter((o) => !o.event.start);
  return (
    <Card title="Расписание" icon={<CalendarDays size={18} />} action={<Link to="/calendar" className="text-sm text-sky-600 dark:text-sky-300">Календарь</Link>}>
      {allDay.map((o) => (
        <div key={o.event.id} className="mb-2 rounded-xl px-3 py-1.5 text-sm font-medium" style={{ background: o.event.color + '33' }}>{o.event.title} · весь день</div>
      ))}
      {slots.length === 0 && allDay.length === 0 ? (
        <p className="text-sm text-muted">Ничего не запланировано по времени.</p>
      ) : (
        <ol className="relative space-y-2 border-l border-[rgb(var(--line)/0.12)] pl-4">
          {slots.map((s, i) => {
            const past = (s.end ?? s.time) < now;
            return (
              <li key={i} className={past ? 'opacity-50' : ''}>
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <div className="text-xs tabular-nums text-muted">{s.time}{s.end ? `–${s.end}` : ''}</div>
                <div className={s.done ? 'text-muted line-through' : 'text-[15px]'}>{s.title}</div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function NextWidget({ day, now }: { day: DayView; now: string }) {
  const next = slotsOf(day).find((s) => s.time >= now && !s.done);
  const inMin = next ? timeToMin(next.time) - timeToMin(now) : 0;
  return (
    <Card title="Ближайшее" icon={<CalendarClock size={18} />}>
      {next ? (
        <div className="flex items-center gap-3">
          <div className="h-12 w-1.5 rounded-full" style={{ background: next.color }} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{next.title}</p>
            <p className="text-sm text-muted">в {next.time} · {inMin < 60 ? `через ${inMin} мин` : `через ${Math.floor(inMin / 60)} ч ${inMin % 60} мин`}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">На сегодня больше ничего по времени.</p>
      )}
    </Card>
  );
}

function MoneyWidget({ day }: { day: DayView }) {
  const m = day.money;
  const [quick, setQuick] = useState(false);
  const b = m.monthBudget;
  const pct = b && b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
  return (
    <Card title="Деньги" icon={<Wallet size={18} />} action={<Link to="/finance" className="text-sm text-sky-600 dark:text-sky-300">Финансы</Link>}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Остаток" value={m.hasAccounts ? fmtMoney(Math.round(m.balance)) : '—'} />
        <Stat label="Сегодня" value={fmtMoney(Math.round(m.spentToday))} />
        <Stat label="За месяц" value={fmtMoney(Math.round(m.spentMonth))} />
      </div>
      {m.accounts.length > 1 && (
        <ul className="mt-3 space-y-1 text-sm">
          {m.accounts.slice(0, 4).map((a) => (
            <li key={a.id} className="flex justify-between gap-2">
              <span className="truncate text-muted">{a.name}</span>
              <span className={cx('tabular-nums font-medium', a.balance < 0 && 'text-red-500 dark:text-red-300')}>{fmtMoney(Math.round(a.balance * 100) / 100, a.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {b && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted">Бюджет месяца</span>
            <span className={cx('tabular-nums', pct > 100 ? 'font-semibold text-red-500 dark:text-red-300' : 'text-muted')}>
              {pct > 100 ? `сверх на ${fmtMoney(Math.round(b.spent - b.amount))}` : `осталось ${fmtMoney(Math.round(b.amount - b.spent))}`}
            </span>
          </div>
          <Bar value={pct} danger={pct > 100} />
        </div>
      )}
      {m.overBudget.length > 0 && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-300">Превышен бюджет: {m.overBudget.map((c) => c === '__total' ? 'весь месяц' : findCategory(c)?.name ?? c).join(', ')}</p>
      )}
      {m.upcoming.length > 0 && (
        <p className="mt-2 truncate text-xs text-muted">Скоро: {m.upcoming.map((u) => `${u.title} ${fmtMoney(u.amount, u.currency)} (${fmtRelative(u.date).toLowerCase()})`).join(' · ')}</p>
      )}
      <Button size="sm" variant="soft" className="mt-3 w-full" icon={<Calculator size={15} />} onClick={() => setQuick(true)}>Записать расход</Button>
      {!m.hasData && <p className="mt-2 text-xs text-muted">Или через «+»: например «кофе 250».</p>}
      <QuickMoney open={quick} onClose={() => setQuick(false)} />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function InboxWidget() {
  const count = useLiveQuery(async () => (await db.inbox.toArray()).filter((i) => alive(i) && !i.processed).length, [], 0);
  const { open } = useCapture();
  return (
    <Card title="Входящие" icon={<Inbox size={18} />}>
      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold tabular-nums">{count}</div>
        <p className="flex-1 text-sm text-muted">{count ? 'записей ждут разбора' : 'Всё разобрано. Мысль? Жмите «+».'}</p>
        {count ? <Link to="/inbox"><Button size="sm" variant="soft">Разобрать</Button></Link> : <Button size="sm" variant="soft" onClick={() => open()}>Записать</Button>}
      </div>
    </Card>
  );
}

function QuoteWidget({ date }: { date: string }) {
  return (
    <Card className="flex gap-3">
      <Quote size={20} className="mt-0.5 shrink-0 text-accent-teal" />
      <p className="text-[15px] italic leading-relaxed">{quoteOfDay(date)}</p>
    </Card>
  );
}
