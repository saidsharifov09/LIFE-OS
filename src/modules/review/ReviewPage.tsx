// Утренний обзор (план на день) и вечерний отчёт (итоги, перенос недоделанного, запись в историю).
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight, CalendarDays, CheckCircle2, Moon, Star, Sunrise } from 'lucide-react';
import { db } from '@/db/db';
import type { LogEntry, Task } from '@/db/types';
import { MOODS as MOOD_SCALE } from '@/modules/health/moods';
import { addLogEntry, alive, getDay, getReview, markReview, moveTask, moveUnfinished, setHealth, setTop, sortTasks } from '@/actions';
import { addDays, fmtDayLong, fmtRelative, minToTime, timeToMin, today } from '@/lib/dates';
import { cx, plural } from '@/lib/format';
import { Button, Card, Input, PageHeader, Segmented, Textarea } from '@/ui/primitives';
import { Ring, fireConfetti } from '@/ui/feedback';
import { useToast } from '@/ui/overlay';
import { TaskItem } from '@/modules/tasks/TaskItem';
import { TaskEditor } from '@/modules/tasks/TaskEditor';

export default function ReviewPage() {
  const { kind } = useParams();
  const navigate = useNavigate();
  if (kind !== 'morning' && kind !== 'evening') {
    return <Navigate to={`/review/${new Date().getHours() < 15 ? 'morning' : 'evening'}`} replace />;
  }
  return (
    <>
      <PageHeader
        title={kind === 'morning' ? 'Утренний обзор' : 'Вечерний отчёт'}
        subtitle={fmtDayLong(today())}
        action={
          <Segmented value={kind} onChange={(v) => navigate(`/review/${v}`)} options={[
            { value: 'morning', label: <Sunrise size={18} aria-label="Утро" /> },
            { value: 'evening', label: <Moon size={18} aria-label="Вечер" /> },
          ]} />
        }
      />
      {kind === 'morning' ? <Morning /> : <Evening />}
    </>
  );
}

function Step({ n, title, children, hint }: { n: number; title: string; children: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <span className="grad-accent grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-slate-950">{n}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

// ---------- Утро ----------
function Morning() {
  const toast = useToast();
  const navigate = useNavigate();
  const t0 = today();
  const day = useLiveQuery(() => getDay(t0), [t0]);
  const backlog = useLiveQuery(async () => (await db.tasks.toArray()).filter((t) => alive(t) && !t.done && !t.date).sort(sortTasks).slice(0, 8), []) ?? [];
  const [intention, setIntention] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  useEffect(() => { getReview('morning').then((r) => r?.intention && setIntention(r.intention)); }, []);
  if (!day) return null;

  const candidates = day.tasks.filter((t) => !t.done);
  const topCount = day.top.length;
  const toggleTop = async (t: Task) => {
    if (t.topDate === t0) await setTop(t.id, null);
    else if (topCount >= 3) toast.show('Только 3 главных — остальное бонус 🙂');
    else await setTop(t.id, t0);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Step n={1} title="Что сегодня по времени" hint={day.events.length ? undefined : 'Событий нет — день гибкий.'}>
        {day.events.length > 0 && (
          <ul className="space-y-1.5">
            {day.events.map((o) => (
              <li key={o.event.id} className="flex items-center gap-3 text-[15px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.event.color }} />
                <span className="w-24 shrink-0 tabular-nums text-muted">{o.event.start ? `${o.event.start}–${minToTime(timeToMin(o.event.start) + o.event.duration)}` : 'весь день'}</span>
                <span className="truncate">{o.event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Step>

      {day.overdue.length > 0 && (
        <Step n={2} title={`Хвосты: ${day.overdue.length} ${plural(day.overdue.length, ['просроченная', 'просроченных', 'просроченных'])}`} hint="Решите быстро: сегодня или потом. Без чувства вины.">
          <ul className="space-y-1">
            {day.overdue.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-2xl px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{t.title} <span className="text-xs text-red-700 dark:text-red-400">· {fmtRelative(t.date!)}</span></span>
                <Button size="sm" variant="soft" onClick={() => moveTask(t.id, t0)}>Сегодня</Button>
                <Button size="sm" variant="ghost" onClick={() => moveTask(t.id, null)}>Потом</Button>
              </li>
            ))}
          </ul>
          <Button className="mt-2" size="sm" variant="primary" onClick={async () => { const n = await moveUnfinished(addDays(t0, -1), t0); toast.show(`На сегодня: ${n}`, { undo: true }); }}>Все на сегодня</Button>
        </Step>
      )}

      <Step n={day.overdue.length ? 3 : 2} title={`3 главных дела (${topCount}/3)`} hint="Отметьте звёздочкой. Если сделать только их — день удался.">
        {candidates.length === 0 && backlog.length === 0 ? (
          <p className="text-sm text-muted">На сегодня задач нет. Добавьте через «+» внизу.</p>
        ) : (
          <ul className="space-y-1">
            {[...candidates, ...backlog].map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <button onClick={() => toggleTop(t)} className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl" aria-pressed={t.topDate === t0} aria-label="Главное дело">
                  <Star size={22} className={cx('transition', t.topDate === t0 ? 'scale-110 fill-amber-300 text-amber-300' : 'text-muted')} />
                </button>
                <button className="min-w-0 flex-1 truncate py-2 text-left" onClick={() => setEditing(t)}>
                  {t.title}{!t.date && <span className="ml-1 text-xs text-muted">· без даты</span>}
                </button>
                {!t.date && <Button size="sm" variant="ghost" onClick={() => moveTask(t.id, t0)}>На сегодня</Button>}
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={day.overdue.length ? 4 : 3} title="Намерение дня" hint="Одной фразой: каким должен быть день?">
        <Input value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="Например: спокойно закончить отчёт" />
      </Step>

      <Button size="lg" variant="primary" className="w-full" icon={<Sunrise size={20} />} onClick={async () => {
        await markReview('morning', t0, intention.trim() || undefined);
        fireConfetti();
        toast.show('Отличного дня! ☀️');
        navigate('/');
      }}>Начать день</Button>
      <TaskEditor open={!!editing} task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ---------- Вечер ----------
// Та же шкала, что в «Здоровье» — настроение из отчёта записывается и туда
const MOODS = MOOD_SCALE as readonly { v: NonNullable<LogEntry['mood']>; e: string; l: string }[];

function Evening() {
  const toast = useToast();
  const navigate = useNavigate();
  const t0 = today();
  const tomorrow = addDays(t0, 1);
  const day = useLiveQuery(() => getDay(t0), [t0]);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<LogEntry['mood']>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  if (!day) return null;

  const all = [...day.overdue, ...day.tasks];
  const done = all.filter((t) => t.done);
  const left = all.filter((t) => !t.done);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Step n={1} title="Итоги дня">
        <div className="flex items-center gap-5">
          <Ring value={day.progress.percent} size={96}><span className="text-xl font-bold">{day.progress.percent}%</span></Ring>
          <div>
            <p className="text-lg font-semibold">{done.length ? `Сделано: ${done.length} ${plural(done.length, ['дело', 'дела', 'дел'])}` : 'День был другим — и это нормально'}</p>
            {day.top.length > 0 && <p className="text-sm text-muted">Главные: {day.top.filter((t) => t.done).length} из {day.top.length}</p>}
          </div>
        </div>
        {done.length > 0 && (
          <ul className="mt-3 space-y-1 text-[15px]">
            {done.map((t) => <li key={t.id} className="flex items-center gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-400" /><span className="truncate">{t.title}</span></li>)}
          </ul>
        )}
      </Step>

      <Step n={2} title={left.length ? `Недоделанное: ${left.length}` : 'Недоделанного нет 🎉'} hint={left.length ? 'Перенесите в один тап — завтра разберётесь.' : undefined}>
        {left.length > 0 && (
          <>
            <ul>
              <AnimatePresence initial={false}>
                {left.map((t) => <TaskItem key={t.id} task={t} onOpen={setEditing} compact />)}
              </AnimatePresence>
            </ul>
            <Button className="mt-2" variant="primary" icon={<ArrowRight size={18} />} onClick={async () => {
              const n = await moveUnfinished(t0, tomorrow);
              toast.show(`Перенесено на завтра: ${n}`, { undo: true });
            }}>Всё на завтра</Button>
          </>
        )}
      </Step>

      <Step n={3} title="Запись в историю" hint="Что было главным? Что узнал? Какое решение принял?">
        <div className="mb-3 flex justify-between gap-1">
          {MOODS.map((m) => (
            <button key={m.v} onClick={() => setMood(mood === m.v ? null : m.v)} aria-pressed={mood === m.v} aria-label={m.l}
              className={cx('focus-ring flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition', mood === m.v ? 'bg-sky-400/20 ring-1 ring-sky-400/60' : 'hover:bg-[rgb(var(--line)/0.05)]')}>
              <span className="text-2xl">{m.e}</span>
              <span className="text-[10px] text-muted">{m.l}</span>
            </button>
          ))}
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Пара предложений о дне…" />
      </Step>

      <Button size="lg" variant="primary" className="w-full" icon={<Moon size={20} />} onClick={async () => {
        if (text.trim() || mood) await addLogEntry({ text: text.trim() || 'Вечерний отчёт', kind: 'evening', mood });
        if (mood) await setHealth(t0, { mood }); // настроение дня — и в «Здоровье»
        await markReview('evening', t0);
        toast.show('День завершён. Спокойной ночи 🌙');
        navigate('/');
      }}>Завершить день</Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><CalendarDays size={13} /> Завтра: {fmtDayLong(tomorrow)}</p>
      <TaskEditor open={!!editing} task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
