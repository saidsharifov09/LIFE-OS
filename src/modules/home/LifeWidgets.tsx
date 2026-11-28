// Виджеты главной Этапа 5: привычки на сегодня и здоровье (вода, сон, настроение) — в одно касание.
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Droplets, Flame, HeartPulse, Minus, Plus } from 'lucide-react';
import { addWater, getHealth, habitChecks, listHabits, setHealth } from '@/actions';
import type { HealthDay } from '@/db/types';
import { addDays, today } from '@/lib/dates';
import { checkMap, currentStreak, isScheduled, WATER_GOAL } from '@/lib/habits';
import { cx } from '@/lib/format';
import { Button, Card, Empty } from '@/ui/primitives';
import { fireConfetti } from '@/ui/feedback';
import { HabitButton } from '@/modules/goals/shared';
import { MOODS } from '@/modules/health/moods';

export function HabitsWidget() {
  const t0 = today();
  const data = useLiveQuery(async () => {
    const habits = (await listHabits()).filter((h) => isScheduled(h, t0));
    const checks = await habitChecks(addDays(t0, -120), t0);
    return habits.map((h) => {
      const m = checkMap(checks.filter((c) => c.habitId === h.id));
      return { h, count: m.get(t0) ?? 0, streak: currentStreak(h, m, t0) };
    });
  }, [t0]);
  if (!data) return null;
  const done = data.filter((x) => x.count >= x.h.target).length;
  const onDone = () => setTimeout(async () => {
    const cs = await habitChecks(t0, t0);
    if (data.length && data.every((x) => (cs.find((c) => c.habitId === x.h.id)?.count ?? 0) >= x.h.target)) fireConfetti();
  }, 50);
  return (
    <Card title="Привычки" icon={<Flame size={18} />} action={<Link to="/goals" className="text-sm text-sky-700 dark:text-sky-300">{data.length ? `${done}/${data.length}` : 'Все'}</Link>}>
      {data.length === 0 ? (
        <Empty title="На сегодня привычек нет" hint={<Link to="/goals" className="text-sky-700 dark:text-sky-300">Добавить привычку →</Link>} />
      ) : (
        <div className="-mx-1 space-y-0.5">
          {data.map(({ h, count, streak }) => <HabitButton key={h.id} habit={h} count={count} streak={streak} compact onDone={onDone} />)}
        </div>
      )}
    </Card>
  );
}

export function HealthWidget() {
  const t0 = today();
  const day = useLiveQuery(() => getHealth(t0), [t0]);
  const water = day?.water ?? 0;
  const sleep = day?.sleep ?? null;
  return (
    <Card title="Вода, сон, настроение" icon={<Droplets size={18} />} action={<Link to="/health" className="text-sm text-sky-700 dark:text-sky-300"><HeartPulse size={16} className="inline" /> Здоровье</Link>}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm"><b className="text-xl tabular-nums">{water}</b><span className="text-muted"> / {WATER_GOAL} стаканов</span></span>
        <Button size="icon" variant="soft" className="!h-10 !w-10" aria-label="Минус стакан" disabled={!water} onClick={() => addWater(-1)}><Minus size={17} /></Button>
        <Button size="icon" variant="primary" className="!h-10 !w-10" aria-label="Плюс стакан воды" onClick={() => addWater(1)}><Plus size={19} /></Button>
      </div>
      <div className="mt-1 flex gap-0.5" aria-hidden>
        {Array.from({ length: WATER_GOAL }, (_, i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < water ? 'bg-sky-400' : 'bg-[rgb(var(--line)/0.1)]')} />)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Сон</span>
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {[5, 6, 7, 8, 9].map((h) => (
            <button key={h} onClick={() => setHealth(t0, { sleep: sleep === h ? null : h })} aria-pressed={sleep === h}
              className={cx('focus-ring h-8 min-w-[2.6rem] flex-1 rounded-full text-[13px] font-medium transition', sleep === h ? 'bg-indigo-400/25 text-fg ring-1 ring-indigo-400/60' : 'bg-[rgb(var(--line)/0.06)] text-muted')}>{h} ч</button>
          ))}
        </div>
      </div>
      {sleep !== null && ![5, 6, 7, 8, 9].includes(sleep) && <p className="mt-1 text-right text-xs text-muted">записано {sleep.toLocaleString('ru-RU')} ч</p>}
      <div className="mt-3 flex items-center gap-2">
        <span className="w-14 text-sm text-muted">Настр.</span>
        <div className="flex flex-1 justify-between">
          {MOODS.map((m) => (
            <button key={m.v} onClick={() => setHealth(t0, { mood: day?.mood === m.v ? null : (m.v as HealthDay['mood']) })} aria-pressed={day?.mood === m.v} aria-label={`Настроение: ${m.l}`}
              className={cx('focus-ring grid h-9 w-9 place-items-center rounded-full text-xl transition', day?.mood === m.v ? 'bg-sky-400/20 ring-1 ring-sky-400/60' : 'opacity-60 hover:opacity-100')}>{m.e}</button>
          ))}
        </div>
      </div>
    </Card>
  );
}
