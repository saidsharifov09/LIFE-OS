// Раздел «Задачи»: группы по датам, фильтры, вид списком и канбаном.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence } from 'framer-motion';
import { CheckCircle2, Columns3, List, Plus, Sparkles } from 'lucide-react';
import { db } from '@/db/db';
import type { DateStr, Task } from '@/db/types';
import { useOpenParam } from '@/app/useOpenParam';
import { useTouchDrag } from '@/ui/touchDrag';
import { addTask, alive, bucketOf, moveTask, sortTasks, type TaskBucket } from '@/actions';
import { addDays, startOfWeek, today } from '@/lib/dates';
import { parseCapture } from '@/lib/parse';
import { TASK_CATEGORIES } from '@/lib/categories';
import { cx } from '@/lib/format';
import { Button, Card, Chip, Empty, Input, PageHeader, Segmented } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { TaskItem } from './TaskItem';
import { TaskEditor } from './TaskEditor';

type Filter = TaskBucket | 'all';

const BUCKETS: { id: Filter; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'tomorrow', label: 'Завтра' },
  { id: 'week', label: 'Неделя' },
  { id: 'future', label: 'Будущее' },
  { id: 'nodate', label: 'Без даты' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'done', label: 'Выполненные' },
  { id: 'all', label: 'Все' },
];

const KANBAN: { id: TaskBucket; label: string; target: () => DateStr | null }[] = [
  { id: 'overdue', label: 'Просрочено', target: () => today() },
  { id: 'today', label: 'Сегодня', target: () => today() },
  { id: 'tomorrow', label: 'Завтра', target: () => addDays(today(), 1) },
  { id: 'week', label: 'На неделе', target: () => addDays(startOfWeek(today()), 6) },
  { id: 'future', label: 'Позже', target: () => addDays(startOfWeek(today()), 7) },
  { id: 'nodate', label: 'Без даты', target: () => null },
];

/** Дата по умолчанию для новой задачи в выбранной группе */
function defaultDateFor(f: Filter): DateStr | null {
  if (f === 'today' || f === 'overdue' || f === 'all' || f === 'done') return today();
  if (f === 'tomorrow') return addDays(today(), 1);
  if (f === 'week') return addDays(today(), 2);
  if (f === 'future') return addDays(startOfWeek(today()), 7);
  return null;
}

export default function TasksPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('today');
  const [view, setView] = useState<'list' | 'kanban'>(() => (localStorage.getItem('lifeos.tasksView') as 'list' | 'kanban') ?? 'list');
  const [cat, setCat] = useState<string | null>(null);
  const [prio, setPrio] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [quick, setQuick] = useState('');

  const loaded = useLiveQuery(async () => (await db.tasks.toArray()).filter(alive).sort(sortTasks), []);
  const all = loaded ?? [];
  // Переход из поиска: /tasks?open=<id> — показать группу задачи и открыть карточку
  useOpenParam('open', (id) => {
    if (!loaded) return false;
    const t = loaded.find((x) => x.id === id);
    if (t) { setCat(null); setPrio(false); setFilter(t.done ? 'done' : bucketOf(t)); setEditing(t); }
  });
  const filtered = useMemo(() => all.filter((t) => (!cat || t.category === cat) && (!prio || t.priority >= 2)), [all, cat, prio]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of filtered) c[bucketOf(t)] = (c[bucketOf(t)] ?? 0) + 1;
    c.all = filtered.filter((t) => !t.done).length;
    return c;
  }, [filtered]);

  const shown = filtered.filter((t) => {
    const b = bucketOf(t);
    if (filter === 'all') return !t.done;
    if (filter === 'today') return b === 'today' || b === 'overdue' || (t.done && t.date === today());
    return b === filter;
  });
  // Выполненные — последние сверху
  if (filter === 'done') shown.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  const quickAdd = async () => {
    const text = quick.trim();
    if (!text) return;
    const h = parseCapture(text);
    await addTask({ title: h.cleanText ?? text, date: h.date ?? defaultDateFor(filter), time: h.time ?? null, category: cat });
    setQuick('');
    toast.show('Задача добавлена ✓', { undo: true });
  };

  const setViewSaved = (v: 'list' | 'kanban') => { setView(v); try { localStorage.setItem('lifeos.tasksView', v); } catch { /* ignore */ } };

  return (
    <>
      <PageHeader
        title="Задачи"
        subtitle={`${counts.all ?? 0} активных`}
        action={
          <div className="flex items-center gap-2">
            <Segmented value={view} onChange={setViewSaved} options={[{ value: 'list', label: <List size={18} aria-label="Список" /> }, { value: 'kanban', label: <Columns3 size={18} aria-label="Канбан" /> }]} />
            <Button variant="primary" size="icon" aria-label="Новая задача" onClick={() => setCreating(true)}><Plus size={20} /></Button>
          </div>
        }
      />

      {/* Быстрое добавление */}
      <form onSubmit={(e) => { e.preventDefault(); quickAdd(); }} className="mb-3 flex gap-2">
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Новая задача… (можно «завтра в 10:00»)" aria-label="Быстрое добавление задачи" />
        <Button type="submit" variant="soft" size="icon" aria-label="Добавить" disabled={!quick.trim()}><Plus size={20} /></Button>
      </form>

      {view === 'list' && (
        <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {BUCKETS.map((b) => (
            <Chip key={b.id} active={filter === b.id} onClick={() => setFilter(b.id)}
              className={b.id === 'overdue' && counts.overdue ? '!text-red-700 dark:!text-red-400' : ''}>
              {b.label}{b.id !== 'done' && counts[b.id === 'today' ? 'today' : b.id] ? <span className="opacity-70">{b.id === 'today' ? (counts.today ?? 0) + (counts.overdue ?? 0) : counts[b.id]}</span> : null}
            </Chip>
          ))}
        </div>
      )}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={prio} onClick={() => setPrio(!prio)}>Важные</Chip>
        {TASK_CATEGORIES.map((c) => (
          <Chip key={c.id} color={c.color} active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.name}</Chip>
        ))}
      </div>

      {view === 'list' ? (
        <Card pad={false} className="p-2 sm:p-3">
          {shown.length === 0 ? (
            filter === 'today' && all.length > 0 ? (
              <Empty icon={<CheckCircle2 size={26} />} title="На сегодня всё чисто" hint="Можно отдохнуть или взять задачу из «Завтра»." />
            ) : (
              <Empty icon={<Sparkles size={26} />} title="Здесь пока пусто" hint="Добавьте задачу полем выше или кнопкой «+» внизу." />
            )
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {shown.map((t) => <TaskItem key={t.id} task={t} onOpen={setEditing} showDate={filter !== 'today' || t.date !== today()} />)}
              </AnimatePresence>
            </ul>
          )}
        </Card>
      ) : (
        <Kanban tasks={filtered.filter((t) => !t.done)} onOpen={setEditing} />
      )}

      <TaskEditor open={!!editing || creating} task={editing} defaultDate={defaultDateFor(filter)} onClose={() => { setEditing(null); setCreating(false); }} />
    </>
  );
}

function Kanban({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const toast = useToast();
  // Перетаскивание: мышью — сразу, пальцем — долгим нажатием (src/ui/touchDrag.ts)
  const drop = async (t: Task, colId: string) => {
    const col = KANBAN.find((c) => c.id === colId);
    if (!col || bucketOf(t) === col.id) return;
    await moveTask(t.id, col.target());
    toast.show(`Перенесено: ${col.label.toLowerCase()}`, { undo: true });
  };
  return (
    <>
      <p className="mb-2 text-xs text-muted">Перенести: <span className="lg:hidden">удерживайте карточку и ведите пальцем</span><span className="hidden lg:inline">перетащите карточку мышью</span> в другую колонку.</p>
      <div data-drag-scroll className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {KANBAN.map((col) => {
          const items = tasks.filter((t) => bucketOf(t) === col.id);
          if (col.id === 'overdue' && !items.length) return null;
          return (
            <Card key={col.id} pad={false} data-drop={col.id} className="drop-zone w-[80vw] max-w-[300px] shrink-0 snap-start p-2 sm:w-72">
              <div className="flex items-center justify-between px-2 py-2">
                <h3 className={cx('text-sm font-semibold', col.id === 'overdue' && 'text-red-700 dark:text-red-400')}>{col.label}</h3>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <div className="min-h-16 space-y-1.5">
                {items.map((t) => <KanbanCard key={t.id} task={t} onOpen={onOpen} onDrop={(key) => drop(t, key)} />)}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function KanbanCard({ task, onOpen, onDrop }: { task: Task; onOpen: (t: Task) => void; onDrop: (key: string) => void }) {
  const drag = useTouchDrag({ onDrop });
  return (
    <ul {...drag} className="cursor-grab rounded-2xl bg-[rgb(var(--line)/0.04)] active:cursor-grabbing">
      <TaskItem task={task} onOpen={onOpen} compact />
    </ul>
  );
}
