// Собственный календарь: день, неделя, месяц. События с длительностью, повторами, цветами; связь с задачами.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react';
import { db } from '@/db/db';
import type { DateStr, Task } from '@/db/types';
import { alive, eventsInRange, moveEvent, moveTask, sortTasks, type Occurrence } from '@/actions';
import {
  addDays, addMonths, endOfMonth, fmtDayLong, fmtRelative, fromDateStr, minToTime, MONTHS_NOM, startOfMonth,
  startOfWeek, timeToMin, today, WEEKDAYS_SHORT, MONTHS_GEN,
} from '@/lib/dates';
import { cx } from '@/lib/format';
import { Button, Card, Empty, PageHeader, Segmented } from '@/ui/primitives';
import { TaskItem } from '@/modules/tasks/TaskItem';
import { TaskEditor } from '@/modules/tasks/TaskEditor';
import { EventEditor } from './EventEditor';
import { useOpenParam } from '@/app/useOpenParam';
import { TimeGrid } from './TimeGrid';
import { useTouchDrag } from '@/ui/touchDrag';
import { useToast } from '@/ui/overlay';

type View = 'day' | 'week' | 'month';

function useIsWide() {
  const [wide, setWide] = useState(() => matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width: 640px)');
    const fn = () => setWide(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return wide;
}

export default function CalendarPage() {
  const [view, setView] = useState<View>(() => (localStorage.getItem('lifeos.calView') as View) ?? 'month');
  const [cursor, setCursor] = useState<DateStr>(today());
  const [openOcc, setOpenOcc] = useState<Occurrence | null>(null);
  const [creating, setCreating] = useState<{ date: DateStr; start?: string } | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const wide = useIsWide();

  const range = useMemo((): [DateStr, DateStr] => {
    if (view === 'day') return [cursor, cursor];
    if (view === 'week') return [startOfWeek(cursor), addDays(startOfWeek(cursor), 6)];
    return [startOfWeek(startOfMonth(cursor)), addDays(startOfWeek(endOfMonth(cursor)), 6)];
  }, [view, cursor]);

  const occ = useLiveQuery(() => eventsInRange(range[0], range[1]), [range[0], range[1]]) ?? [];
  const tasks = useLiveQuery(async () => (await db.tasks.toArray()).filter((t) => alive(t) && t.date && t.date >= range[0] && t.date <= range[1]).sort(sortTasks), [range[0], range[1]]) ?? [];

  // Переход из поиска: ?date=YYYY-MM-DD&open=<событие> — показать день и открыть событие
  useOpenParam('date', (d, params) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setCursor(d);
    setView('day');
    const id = params.get('open');
    if (id) eventsInRange(d, d).then((list) => { const o = list.find((x) => x.event.id === id); if (o) setOpenOcc(o); });
  }, ['open']);

  const setViewSaved = (v: View) => { setView(v); try { localStorage.setItem('lifeos.calView', v); } catch { /* ignore */ } };
  const step = (dir: number) => setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : addMonths(c, dir)));

  const c = fromDateStr(cursor);
  const title = view === 'month'
    ? `${MONTHS_NOM[c.getMonth()]} ${c.getFullYear()}`
    : view === 'week'
      ? weekTitle(range[0], range[1])
      : fmtRelative(cursor);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(range[0], i));

  return (
    <>
      <PageHeader
        title={title}
        subtitle={view === 'day' ? fmtDayLong(cursor) : 'Календарь'}
        action={<Button variant="primary" size="icon" aria-label="Новое событие" onClick={() => setCreating({ date: cursor })}><Plus size={20} /></Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<View> value={view} onChange={setViewSaved} className="flex-1 sm:max-w-xs" options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
        <div className="flex gap-1">
          <Button size="icon" variant="soft" aria-label="Назад" onClick={() => step(-1)}><ChevronLeft size={20} /></Button>
          <Button variant="soft" onClick={() => setCursor(today())}>Сегодня</Button>
          <Button size="icon" variant="soft" aria-label="Вперёд" onClick={() => step(1)}><ChevronRight size={20} /></Button>
        </div>
      </div>

      {view === 'month' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <MonthGrid cursor={cursor} from={range[0]} occ={occ} tasks={tasks} onSelect={setCursor} onOpenDay={(d) => { setCursor(d); setViewSaved('day'); }} />
          <Agenda date={cursor} occ={occ.filter((o) => o.date === cursor)} tasks={tasks.filter((t) => t.date === cursor)} onOpen={setOpenOcc} onTask={setTask} onAdd={() => setCreating({ date: cursor })} />
        </div>
      )}

      {view === 'week' && (wide ? (
        <TimeGrid days={weekDays} occurrences={occ} tasks={tasks} onOpen={setOpenOcc} onCreate={(date, start) => setCreating({ date, start })} />
      ) : (
        <div className="space-y-3">
          {weekDays.map((d) => (
            <Agenda key={d} date={d} compact occ={occ.filter((o) => o.date === d)} tasks={tasks.filter((t) => t.date === d)} onOpen={setOpenOcc} onTask={setTask} onAdd={() => setCreating({ date: d })} />
          ))}
        </div>
      ))}

      {view === 'day' && (
        <TimeGrid days={[cursor]} occurrences={occ} tasks={tasks} onOpen={setOpenOcc} onCreate={(date, start) => setCreating({ date, start })} />
      )}

      <EventEditor
        open={!!openOcc || !!creating}
        event={openOcc?.event}
        occurrenceDate={openOcc?.date}
        defaults={creating ?? undefined}
        onClose={() => { setOpenOcc(null); setCreating(null); }}
      />
      <TaskEditor open={!!task} task={task} onClose={() => setTask(null)} />
    </>
  );
}

function weekTitle(a: DateStr, b: DateStr) {
  const da = fromDateStr(a), db_ = fromDateStr(b);
  if (da.getMonth() === db_.getMonth()) return `${da.getDate()}–${db_.getDate()} ${MONTHS_GEN[da.getMonth()]}`;
  return `${da.getDate()} ${MONTHS_GEN[da.getMonth()].slice(0, 3)} – ${db_.getDate()} ${MONTHS_GEN[db_.getMonth()].slice(0, 3)}`;
}

function MonthGrid({ cursor, from, occ, tasks, onSelect, onOpenDay }: {
  cursor: DateStr; from: DateStr; occ: Occurrence[]; tasks: Task[]; onSelect: (d: DateStr) => void; onOpenDay: (d: DateStr) => void;
}) {
  const t0 = today();
  const month = cursor.slice(0, 7);
  const weeks = Math.round((fromDateStr(addDays(startOfWeek(endOfMonth(cursor)), 7)).getTime() - fromDateStr(from).getTime()) / (7 * 86400000));
  return (
    <Card pad={false} className="p-2 sm:p-3">
      <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-medium uppercase text-muted">
        {WEEKDAYS_SHORT.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i)).map((d) => {
          const dayOcc = occ.filter((o) => o.date === d);
          const dayTasks = tasks.filter((t) => t.date === d && !t.done);
          const inMonth = d.slice(0, 7) === month;
          return (
            <button
              key={d}
              data-drop={`day:${d}`}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onOpenDay(d)}
              className={cx(
                'drop-zone focus-ring flex min-h-[3.4rem] flex-col items-center rounded-2xl p-1 text-left transition sm:min-h-[5.5rem] sm:items-stretch',
                d === cursor ? 'bg-sky-400/15 ring-1 ring-sky-400/50' : 'hover:bg-[rgb(var(--line)/0.05)]',
                !inMonth && 'text-muted',
              )}
              aria-label={`${fmtRelative(d)}: событий ${dayOcc.length}, задач ${dayTasks.length}`}
            >
              <span className={cx('grid h-7 w-7 place-items-center rounded-full text-[13px] tabular-nums sm:mb-0.5', inMonth ? 'font-semibold' : 'font-normal', d === t0 && 'grad-accent text-slate-950')}>
                {fromDateStr(d).getDate()}
              </span>
              {/* iPhone: точки, ноутбук: названия */}
              <span className="mt-0.5 flex flex-wrap justify-center gap-0.5 sm:hidden">
                {dayOcc.slice(0, 3).map((o, i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: o.event.color }} />)}
                {dayTasks.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-teal-300/70 ring-1 ring-teal-400" />}
              </span>
              <span className="hidden space-y-0.5 sm:block">
                {dayOcc.slice(0, 2).map((o, i) => (
                  <DraggableEvent as="span" key={i} occ={o} className="block cursor-grab truncate rounded-md px-1 text-[11px]" style={{ background: o.event.color + '33' }}>{o.event.start ? o.event.start + ' ' : ''}{o.event.title}</DraggableEvent>
                ))}
                {(dayOcc.length > 2 || dayTasks.length > 0) && (
                  <span className="block truncate px-1 text-[10px] text-muted">
                    {dayOcc.length > 2 ? `+${dayOcc.length - 2} соб. ` : ''}{dayTasks.length ? `☐ ${dayTasks.length}` : ''}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-1 pt-2 text-[11px] text-muted">
        <span className="sm:hidden">Перенести: удерживайте событие или задачу в списке дня и ведите пальцем на нужный день.</span>
        <span className="hidden sm:inline">Перенести: перетащите событие на другой день (или из списка справа).</span>
      </p>
    </Card>
  );
}

function Agenda({ date, occ, tasks, onOpen, onTask, onAdd, compact }: {
  date: DateStr; occ: Occurrence[]; tasks: Task[]; onOpen: (o: Occurrence) => void; onTask: (t: Task) => void; onAdd: () => void; compact?: boolean;
}) {
  const empty = !occ.length && !tasks.length;
  return (
    <Card
      data-drop={`day:${date}`}
      title={<span className={date === today() ? 'text-teal-700 dark:text-accent-teal' : ''}>{fmtRelative(date)}</span>}
      action={<Button size="sm" variant="ghost" onClick={onAdd} aria-label="Добавить событие"><Plus size={16} /></Button>}
      className={cx('drop-zone', compact && '!py-3')}
    >
      {empty ? (
        compact ? <p className="text-sm text-muted">Свободно</p> : <Empty title="Свободный день" hint="Нажмите «+», чтобы добавить событие." />
      ) : (
        <div className="space-y-2">
          {occ.map((o) => (
            <DraggableEvent key={o.event.id + o.date} occ={o} onClick={() => onOpen(o)} className="focus-ring flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left hover:bg-[rgb(var(--line)/0.05)]">
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: o.event.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{o.event.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {o.event.start ? `${o.event.start}–${minToTime(timeToMin(o.event.start) + o.event.duration)}` : 'Весь день'}
                  {o.event.recurrence && <Repeat size={11} />}
                </span>
              </span>
            </DraggableEvent>
          ))}
          {tasks.length > 0 && (
            <div className={occ.length ? 'hairline border-t pt-1' : ''}>
              <AnimatePresence initial={false}>
                {tasks.map((t) => <DraggableTask key={t.id} task={t} onOpen={onTask} />)}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Перетаскивание на другой день (палец — долгое нажатие, мышь — сразу) ----------

/** Перенос по ключу цели `day:YYYY-MM-DD` (ячейка месяца или карточка дня в списке недели) */
function useDropOnDay() {
  const toast = useToast();
  const dayOf = (key: string) => (key.startsWith('day:') ? key.slice(4) : null);
  return {
    event: async (o: Occurrence, key: string) => {
      const d = dayOf(key);
      if (!d || d === o.date) return;
      await moveEvent(o.event.id, o.date, d);
      toast.show(`Перенесено: ${fmtRelative(d).toLowerCase()}${o.event.recurrence ? ' (вся серия)' : ''}`, { undo: true });
    },
    task: async (t: Task, key: string) => {
      const d = dayOf(key);
      if (!d || d === t.date) return;
      await moveTask(t.id, d);
      toast.show(`Задача — на ${fmtRelative(d).toLowerCase()}`, { undo: true });
    },
  };
}

function DraggableEvent({ occ, as = 'button', className, style, onClick, children }: {
  occ: Occurrence; as?: 'button' | 'span'; className?: string; style?: CSSProperties; onClick?: () => void; children: ReactNode;
}) {
  const drop = useDropOnDay();
  const drag = useTouchDrag({ onDrop: (key) => drop.event(occ, key) });
  const Comp = as;
  return <Comp {...drag} {...(as === 'button' ? { type: 'button' as const } : {})} onClick={onClick} className={className} style={style}>{children}</Comp>;
}

function DraggableTask({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const drop = useDropOnDay();
  const drag = useTouchDrag({ onDrop: (key) => drop.task(task, key) });
  return <ul {...drag}><TaskItem task={task} onOpen={onOpen} showDate={false} compact /></ul>;
}
