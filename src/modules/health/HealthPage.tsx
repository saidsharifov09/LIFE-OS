// «Здоровье»: сон, вода, вес, настроение и самочувствие за день, тренировки, графики. Без медицинских советов.
import { lazy, Suspense, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Droplets, Dumbbell, HeartPulse, Minus, Moon, Plus, Scale, Smile, Trash2 } from 'lucide-react';
import { addWater, addWorkout, deleteWorkout, getHealth, lastWeight, setHealth, workoutsRange } from '@/actions';
import type { HealthDay } from '@/db/types';
import { addDays, fmtRelative, startOfWeek, today } from '@/lib/dates';
import { SLEEP_GOAL, WATER_GOAL } from '@/lib/habits';
import { cx, plural } from '@/lib/format';
import { Button, Card, Chip, Input, Label, PageHeader } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';

import { FEELINGS, MOODS } from './moods';

const HealthCharts = lazy(() => import('./HealthCharts'));

const WORKOUT_KINDS = ['Зал', 'Бег', 'Ходьба', 'Йога', 'Велосипед', 'Плавание', 'Футбол', 'Растяжка'];

export default function HealthPage() {
  const [date, setDate] = useState(today());
  const t0 = today();
  const day = useLiveQuery(() => getHealth(date), [date]);
  const prevWeight = useLiveQuery(() => lastWeight(addDays(date, -1)), [date]);
  const week = useLiveQuery(() => workoutsRange(startOfWeek(date), addDays(startOfWeek(date), 6)), [date]) ?? [];

  return (
    <>
      <PageHeader title="Здоровье" />
      <div className="mb-4 flex items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="Предыдущий день" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={20} /></Button>
        <h2 className="min-w-[9rem] text-center font-semibold">{fmtRelative(date)}</h2>
        <Button size="icon" variant="ghost" aria-label="Следующий день" disabled={date >= t0} onClick={() => setDate(addDays(date, 1))}><ChevronRight size={20} /></Button>
        {date !== t0 && <Button size="sm" variant="soft" onClick={() => setDate(t0)}>Сегодня</Button>}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WaterCard date={date} water={day?.water ?? 0} />
        <SleepCard date={date} sleep={day?.sleep ?? null} />
        <MoodCard date={date} day={day} />
        <WeightCard date={date} weight={day?.weight ?? null} prev={prevWeight?.weight ?? null} />
        <WorkoutCard date={date} week={week} />
        <Card className="md:col-span-2 xl:col-span-3" pad={false}>
          <Suspense fallback={<div className="h-72" />}><HealthCharts /></Suspense>
        </Card>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Это дневник для себя, а не медицинские рекомендации.</p>
    </>
  );
}

function WaterCard({ date, water }: { date: string; water: number }) {
  return (
    <Card title="Вода" icon={<Droplets size={18} />}>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="soft" aria-label="Минус стакан" disabled={!water} onClick={() => addWater(-1, date)}><Minus size={18} /></Button>
        <div className="flex-1 text-center">
          <p className="text-3xl font-bold tabular-nums">{water}<span className="text-base font-medium text-muted"> / {WATER_GOAL}</span></p>
          <p className="text-xs text-muted">{plural(water, ['стакан', 'стакана', 'стаканов'])} · {(water * 0.25).toLocaleString('ru-RU')} л</p>
        </div>
        <Button size="icon" variant="primary" aria-label="Плюс стакан" onClick={() => addWater(1, date)}><Plus size={20} /></Button>
      </div>
      <div className="mt-3 flex justify-center gap-1" aria-hidden>
        {Array.from({ length: Math.max(WATER_GOAL, water) }, (_, i) => (
          <span key={i} className={cx('h-7 w-4 rounded-b-md rounded-t-sm border transition-colors', i < water ? 'border-sky-400 bg-sky-400/70' : 'border-[rgb(var(--line)/0.2)]')} />
        ))}
      </div>
    </Card>
  );
}

function SleepCard({ date, sleep }: { date: string; sleep: number | null }) {
  const set = (v: number | null) => setHealth(date, { sleep: v === null ? null : Math.max(0, Math.min(16, v)) });
  return (
    <Card title="Сон" icon={<Moon size={18} />}>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="soft" aria-label="Меньше на полчаса" onClick={() => set((sleep ?? SLEEP_GOAL) - 0.5)}><Minus size={18} /></Button>
        <div className="flex-1 text-center">
          <p className="text-3xl font-bold tabular-nums">{sleep === null ? '—' : sleep.toLocaleString('ru-RU')}<span className="text-base font-medium text-muted"> ч</span></p>
          <p className="text-xs text-muted">{sleep === null ? 'не записано' : sleep >= 7 ? 'хорошо выспались' : 'маловато'}</p>
        </div>
        <Button size="icon" variant="soft" aria-label="Больше на полчаса" onClick={() => set((sleep ?? SLEEP_GOAL - 1) + 0.5)}><Plus size={18} /></Button>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {[5, 6, 7, 8, 9].map((h) => <Chip key={h} active={sleep === h} onClick={() => set(h)}>{h} ч</Chip>)}
      </div>
    </Card>
  );
}

function Scale5({ value, onChange, items, label }: { value: number | null | undefined; onChange: (v: number | null) => void; items: readonly { v: number; e: string; l: string }[]; label: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {items.map((m) => (
          <button key={m.v} type="button" role="radio" aria-checked={value === m.v} aria-label={m.l} onClick={() => onChange(value === m.v ? null : m.v)}
            className={cx('focus-ring flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition', value === m.v ? 'bg-sky-400/20 ring-1 ring-sky-400/60' : 'hover:bg-[rgb(var(--line)/0.05)]')}>
            <span className="text-2xl">{m.e}</span>
            <span className="text-[10px] text-muted">{m.l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MoodCard({ date, day }: { date: string; day: HealthDay | undefined }) {
  return (
    <Card title="Настроение и самочувствие" icon={<Smile size={18} />}>
      <div className="space-y-3">
        <Scale5 label="Настроение" items={MOODS} value={day?.mood} onChange={(v) => setHealth(date, { mood: v as HealthDay['mood'] })} />
        <Scale5 label="Самочувствие" items={FEELINGS} value={day?.feeling} onChange={(v) => setHealth(date, { feeling: v as HealthDay['feeling'] })} />
      </div>
    </Card>
  );
}

function WeightCard({ date, weight, prev }: { date: string; weight: number | null; prev: number | null }) {
  const toast = useToast();
  const [v, setV] = useState('');
  useEffect(() => { setV(weight === null ? '' : String(weight).replace('.', ',')); }, [weight, date]);
  const save = async () => {
    const n = Number(v.replace(',', '.'));
    if (!v.trim()) { if (weight !== null) await setHealth(date, { weight: null }); return; }
    if (!(n > 20 && n < 400)) { toast.show('Вес в килограммах, например 72,5', { tone: 'error' }); return; }
    if (n !== weight) { await setHealth(date, { weight: Math.round(n * 10) / 10 }); toast.show('Вес записан ✓'); }
  };
  const diff = weight !== null && prev !== null ? Math.round((weight - prev) * 10) / 10 : null;
  return (
    <Card title="Вес" icon={<Scale size={18} />}>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder={prev ? String(prev).replace('.', ',') : '72,5'} aria-label="Вес, кг" className="text-lg font-semibold" />
        <span className="text-muted">кг</span>
        <Button type="submit" variant="soft">OK</Button>
      </form>
      <p className="mt-2 text-sm text-muted">
        {diff !== null ? <>С прошлого раза: <b className="text-fg">{diff > 0 ? '+' : diff < 0 ? '−' : '±'}{Math.abs(diff).toLocaleString('ru-RU')} кг</b></> : prev ? `Последний: ${prev.toLocaleString('ru-RU')} кг` : 'Взвешивайтесь утром, раз в несколько дней — этого достаточно.'}
      </p>
    </Card>
  );
}

function WorkoutCard({ date, week }: { date: string; week: import('@/db/types').Workout[] }) {
  const toast = useToast();
  const [kind, setKind] = useState('Зал');
  const [min, setMin] = useState(30);
  const total = week.reduce((s, w) => s + w.minutes, 0);
  const todays = week.filter((w) => w.date === date);
  return (
    <Card title="Тренировки" icon={<Dumbbell size={18} />} className="md:col-span-2 xl:col-span-2">
      <div className="flex flex-wrap gap-1.5">{WORKOUT_KINDS.map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k}</Chip>)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {[15, 30, 45, 60, 90].map((m) => <Chip key={m} active={min === m} onClick={() => setMin(m)}>{m} мин</Chip>)}
        <Button size="sm" variant="primary" icon={<Plus size={15} />} className="ml-auto" onClick={async () => { await addWorkout({ kind, minutes: min, date }); toast.show(`${kind}, ${min} мин — записано 💪`, { undo: true }); }}>Записать</Button>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm text-muted">На этой неделе: <b className="text-fg">{week.length}</b> · {Math.floor(total / 60) ? `${Math.floor(total / 60)} ч ` : ''}{total % 60} мин</p>
      </div>
      {week.length > 0 && (
        <ul className="mt-2 space-y-1">
          {week.map((w) => (
            <li key={w.id} className={cx('flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm', todays.includes(w) && 'bg-[rgb(var(--line)/0.05)]')}>
              <HeartPulse size={15} className="text-accent-teal" />
              <span className="flex-1">{w.kind} · {w.minutes} мин</span>
              <span className="text-xs text-muted">{fmtRelative(w.date)}</span>
              <button className="p-1 text-muted hover:text-red-400" aria-label={`Удалить: ${w.kind}`} onClick={async () => { await deleteWorkout(w.id); toast.show('Удалено', { undo: true }); }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
