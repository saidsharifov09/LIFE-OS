// «Цели и привычки»: привычки на сегодня, неделя отметок, статистика; цели с этапами и сроками.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOpenParam } from '@/app/useOpenParam';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, CalendarDays, Check as CheckIcon, Flame, Plus, Target, Trash2, Trophy, X } from 'lucide-react';
import type { DateStr, Goal, Habit } from '@/db/types';
import {
  addGoal, addHabit, checkHabit, completeGoal, deleteGoal, deleteHabit, habitChecks, listGoals, listHabits, moveHabit,
  toggleMilestone, updateGoal, updateHabit,
} from '@/actions';
import { addDays, fmtDay, fmtRelative, startOfMonth, today, WEEKDAYS_SHORT, weekday } from '@/lib/dates';
import { bestStreak, checkMap, currentStreak, daysLeft, DAYS_FORMS, goalProgress, isScheduled, periodStats } from '@/lib/habits';
import { PALETTE } from '@/lib/categories';
import { uid } from '@/lib/id';
import { cx, plural } from '@/lib/format';
import { Button, Card, Chip, Empty, Field, Input, Label, PageHeader, Segmented, Textarea } from '@/ui/primitives';
import { Bar, fireConfetti, Ring } from '@/ui/feedback';
import { Sheet, useToast } from '@/ui/overlay';
import { DaysPicker, describeDays, EmojiPicker, GOAL_EMOJI, HABIT_EMOJI, HabitButton } from './shared';

type Tab = 'habits' | 'goals';

export default function GoalsPage() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('lifeos.goals.tab') as Tab) || 'habits');
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('lifeos.goals.tab', t); } catch { /* */ } };
  // Переход из поиска: ?open=<цель> или ?habit=<привычка> — сначала нужная вкладка, карточку откроет вкладка
  const [params] = useSearchParams();
  const want: Tab | null = params.get('open') ? 'goals' : params.get('habit') ? 'habits' : null;
  useEffect(() => { if (want && want !== tab) pick(want); });
  return (
    <>
      <PageHeader title="Цели и привычки" />
      <Segmented<Tab> className="mb-4 max-w-sm" value={tab} onChange={pick} options={[{ value: 'habits', label: 'Привычки' }, { value: 'goals', label: 'Цели' }]} />
      {tab === 'habits' ? <HabitsTab /> : <GoalsTab />}
    </>
  );
}

// ================= Привычки =================

function HabitsTab() {
  const t0 = today();
  const habits = useLiveQuery(() => listHabits(), []);
  const goals = useLiveQuery(() => listGoals(), []) ?? [];
  // Отметки за 400 дней — для серий, лучшей серии и статистики месяца
  const checks = useLiveQuery(() => habitChecks(addDays(t0, -400), t0), [t0]) ?? [];
  const [edit, setEdit] = useState<Habit | 'new' | null>(null);
  useOpenParam('habit', (id) => {
    if (!habits) return false;
    const h = habits.find((x) => x.id === id);
    if (h) setEdit(h);
  });

  const byHabit = useMemo(() => {
    const m = new Map<string, ReturnType<typeof checkMap>>();
    for (const h of habits ?? []) m.set(h.id, checkMap(checks.filter((c) => c.habitId === h.id)));
    return m;
  }, [habits, checks]);

  if (!habits) return <div className="h-40" />;
  const todays = habits.filter((h) => isScheduled(h, t0));
  const doneCount = todays.filter((h) => (byHabit.get(h.id)?.get(t0) ?? 0) >= h.target).length;
  const pct = todays.length ? Math.round((doneCount / todays.length) * 100) : 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6));

  const onDone = () => {
    // после отметки — проверить, все ли привычки дня выполнены
    setTimeout(async () => {
      const cs = await habitChecks(t0, t0);
      const all = todays.every((h) => (cs.find((c) => c.habitId === h.id)?.count ?? 0) >= h.target);
      if (all && todays.length) fireConfetti();
    }, 50);
  };

  if (!habits.length) {
    return (
      <Card>
        <Empty icon={<Flame size={26} />} title="Пока нет привычек" hint="Начните с одной-двух маленьких: «стакан воды утром», «10 минут чтения». Отметка — одно касание, серии мотивируют."
          action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>Новая привычка</Button>} />
        <HabitEditor habit={null} open={!!edit} onClose={() => setEdit(null)} goals={goals} />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Card title="Сегодня" icon={<Flame size={18} />} action={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit('new')}>Привычка</Button>}>
        <div className="mb-3 flex items-center gap-4">
          <Ring value={pct} size={72} stroke={8}><span className="text-sm font-bold tabular-nums">{pct}%</span></Ring>
          <p className="text-sm text-muted">
            {todays.length === 0 ? 'Сегодня привычек по плану нет — отдых.' : doneCount === todays.length ? <b className="text-fg">Все привычки дня выполнены! 🎉</b> : <>Выполнено <b className="text-fg">{doneCount} из {todays.length}</b>. Касание — отметить, ещё раз — снять.</>}
          </p>
        </div>
        <div className="space-y-1">
          {todays.map((h) => (
            <HabitButton key={h.id} habit={h} count={byHabit.get(h.id)?.get(t0) ?? 0} streak={currentStreak(h, byHabit.get(h.id)!, t0)} onDone={onDone} />
          ))}
        </div>
        {habits.length > todays.length && (
          <p className="mt-3 text-xs text-muted">Не сегодня: {habits.filter((h) => !isScheduled(h, t0)).map((h) => `${h.emoji} ${h.title}`).join(', ')}</p>
        )}
      </Card>

      <Card title="Неделя" icon={<CalendarDays size={18} />}>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pb-2 text-left font-normal text-muted"><span className="sr-only">Привычка</span></th>
                {week.map((d) => (
                  <th key={d} className={cx('pb-2 text-center text-xs font-medium', d === t0 ? 'text-sky-600 dark:text-sky-300' : 'text-muted')}>
                    {WEEKDAYS_SHORT[weekday(d)]}<br /><span className="tabular-nums">{d.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const m = byHabit.get(h.id)!;
                return (
                  <tr key={h.id}>
                    <td className="py-1 pr-1 sm:max-w-[8rem] sm:truncate sm:pr-2">
                      <button className="focus-ring truncate text-left text-lg sm:text-sm sm:hover:underline" onClick={() => setEdit(h)} title={h.title}>
                        {h.emoji}<span className="sr-only sm:not-sr-only"> {h.title}</span>
                      </button>
                    </td>
                    {week.map((d) => {
                      const planned = isScheduled(h, d);
                      const n = m.get(d) ?? 0;
                      const done = n >= h.target;
                      return (
                        <td key={d} className="py-1 text-center">
                          <button
                            onClick={() => checkHabit(h.id, d)}
                            aria-label={`${h.title}, ${fmtRelative(d)}: ${done ? 'выполнено' : planned ? 'не выполнено' : 'не по плану'}`}
                            className={cx('focus-ring mx-auto grid h-8 w-8 max-[380px]:h-7 max-[380px]:w-7 place-items-center rounded-full text-[11px] font-bold transition active:scale-90',
                              done ? 'text-slate-950' : n > 0 ? 'ring-2' : planned ? 'bg-[rgb(var(--line)/0.08)]' : 'bg-transparent text-muted')}
                            style={done ? { background: h.color } : n > 0 ? { boxShadow: `inset 0 0 0 2px ${h.color}` } : undefined}
                          >
                            {done ? <CheckIcon size={15} strokeWidth={3} /> : n > 0 ? n : planned ? '' : '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Забыли отметить вчера? Нажмите на кружок нужного дня.</p>
      </Card>

      <Card title="Статистика" icon={<Trophy size={18} />} className="lg:col-span-2">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {habits.map((h) => {
            const m = byHabit.get(h.id)!;
            const w = periodStats(h, m, addDays(t0, -6), t0);
            const mo = periodStats(h, m, startOfMonth(t0), t0);
            const cur = currentStreak(h, m, t0);
            const best = bestStreak(h, m);
            return (
              <li key={h.id} className="rounded-2xl bg-[rgb(var(--line)/0.04)] p-3">
                <button className="focus-ring flex w-full items-center gap-2 text-left" onClick={() => setEdit(h)}>
                  <span className="text-xl">{h.emoji}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{h.title}</span>
                  <span className="text-xs text-muted">{describeDays(h.days)}{h.target > 1 ? ` · ${h.target}×` : ''}</span>
                </button>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-muted">Неделя</span><span className="text-right tabular-nums"><b>{w.percent}%</b> ({w.done}/{w.planned})</span>
                  <Bar value={w.percent} className="col-span-2 !h-1.5" />
                  <span className="text-muted">Месяц</span><span className="text-right tabular-nums"><b>{mo.percent}%</b> ({mo.done}/{mo.planned})</span>
                  <Bar value={mo.percent} className="col-span-2 !h-1.5" />
                  <span className="text-muted">Серия сейчас</span><span className="text-right tabular-nums"><b>{cur}</b> {plural(cur, DAYS_FORMS)}</span>
                  <span className="text-muted">Лучшая серия</span><span className="text-right tabular-nums"><b>{best}</b> {plural(best, DAYS_FORMS)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <HabitEditor habit={edit === 'new' ? null : edit} open={!!edit} onClose={() => setEdit(null)} goals={goals} />
    </div>
  );
}

function HabitEditor({ habit, open, onClose, goals }: { habit: Habit | null; open: boolean; onClose: () => void; goals: Goal[] }) {
  const toast = useToast();
  const [d, setD] = useState({ title: '', emoji: '✅', color: PALETTE[1], days: [] as number[], target: 1, goalId: null as string | null });
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) setD(habit ? { title: habit.title, emoji: habit.emoji, color: habit.color, days: habit.days, target: habit.target, goalId: habit.goalId ?? null }
      : { title: '', emoji: '✅', color: PALETTE[1], days: [], target: 1, goalId: null });
  }
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!d.title.trim()) { toast.show('Введите название', { tone: 'error' }); return; }
    if (habit) await updateHabit(habit.id, { ...d, title: d.title.trim() });
    else await addHabit(d);
    toast.show(habit ? 'Сохранено' : 'Привычка добавлена ✓', { undo: true });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={habit ? 'Привычка' : 'Новая привычка'} footer={
      <div className="flex gap-2">
        {habit && <Button variant="danger" size="icon" aria-label="Удалить привычку" onClick={async () => { await deleteHabit(habit.id); toast.show('Привычка в корзине', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Input autoFocus={!habit} value={d.title} onChange={(e) => set('title', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Например: стакан воды утром" aria-label="Название" className="text-[17px] font-medium" />
        <div><Label>Значок</Label><EmojiPicker value={d.emoji} onChange={(e) => set('emoji', e)} list={HABIT_EMOJI} /></div>
        <div><Label>Когда</Label><DaysPicker value={d.days} onChange={(v) => set('days', v)} /></div>
        <div>
          <Label>Сколько раз в день</Label>
          <div className="flex items-center gap-3">
            <Button size="icon" variant="soft" aria-label="Меньше" onClick={() => set('target', Math.max(1, d.target - 1))}>−</Button>
            <span className="w-8 text-center text-lg font-semibold tabular-nums">{d.target}</span>
            <Button size="icon" variant="soft" aria-label="Больше" onClick={() => set('target', Math.min(20, d.target + 1))}>+</Button>
          </div>
        </div>
        <div>
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={d.color === c} onClick={() => set('color', c)} className="focus-ring h-9 w-9 rounded-full" style={{ background: c, boxShadow: d.color === c ? `0 0 0 3px ${c}66` : undefined }} />)}
          </div>
        </div>
        {goals.filter((g) => !g.done).length > 0 && (
          <div>
            <Label>Помогает достичь цели</Label>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!d.goalId} onClick={() => set('goalId', null)}>Без цели</Chip>
              {goals.filter((g) => !g.done).map((g) => <Chip key={g.id} active={d.goalId === g.id} onClick={() => set('goalId', g.id)}>{g.emoji ?? '🎯'} {g.title}</Chip>)}
            </div>
          </div>
        )}
        {habit && (
          <div className="flex gap-2">
            <Button size="sm" variant="soft" icon={<ArrowUp size={15} />} onClick={() => moveHabit(habit.id, -1)}>Выше</Button>
            <Button size="sm" variant="soft" icon={<ArrowDown size={15} />} onClick={() => moveHabit(habit.id, 1)}>Ниже</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ================= Цели =================

function GoalsTab() {
  const toast = useToast();
  const t0 = today();
  const goals = useLiveQuery(() => listGoals(), []);
  const habits = useLiveQuery(() => listHabits(), []) ?? [];
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  useOpenParam('open', (id) => {
    if (!goals) return false;
    const g = goals.find((x) => x.id === id);
    if (g) setEdit(g);
  });
  if (!goals) return <div className="h-40" />;
  const active = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done);

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <p className="flex-1 text-sm text-muted">{active.length ? `В работе: ${active.length} ${plural(active.length, ['цель', 'цели', 'целей'])}` : 'Целей в работе нет'}{done.length ? ` · достигнуто: ${done.length}` : ''}</p>
        <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setEdit('new')}>Цель</Button>
      </div>
      {goals.length === 0 ? (
        <Card><Empty icon={<Target size={26} />} title="Пока нет целей" hint="Большая цель → маленькие этапы. Каждый отмеченный этап двигает прогресс — так легче дойти до конца." /></Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {[...active, ...done].map((g) => {
            const p = goalProgress(g);
            const left = daysLeft(g.deadline, t0);
            const linked = habits.filter((h) => h.goalId === g.id);
            return (
              <Card key={g.id} className={cx(g.done && 'opacity-70')}>
                <button className="focus-ring flex w-full items-start gap-3 text-left" onClick={() => setEdit(g)}>
                  <Ring value={p} size={60} stroke={7} colors={[g.color, g.color]}><span className="text-lg">{g.emoji ?? '🎯'}</span></Ring>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-[17px] font-semibold leading-snug', g.done && 'line-through')}>{g.title}</span>
                    {g.why && <span className="mt-0.5 block text-sm italic text-muted">«{g.why}»</span>}
                    <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      <b className="text-fg tabular-nums">{p}%</b>
                      {g.deadline && !g.done && (
                        <span className={cx(left! < 0 && 'text-red-600 dark:text-red-300', left! >= 0 && left! <= 7 && 'text-amber-600 dark:text-amber-300')}>
                          до {fmtDay(g.deadline)}{g.deadline.slice(0, 4) !== t0.slice(0, 4) ? ` ${g.deadline.slice(0, 4)}` : ''} · {left! < 0 ? `просрочено на ${-left!} ${plural(-left!, DAYS_FORMS)}` : left === 0 ? 'сегодня' : `осталось ${left} ${plural(left!, DAYS_FORMS)}`}
                        </span>
                      )}
                      {g.done && <span className="text-emerald-600 dark:text-emerald-300">Достигнута 🏆</span>}
                    </span>
                  </span>
                </button>
                {g.milestones.length > 0 && (
                  <ul className="mt-3 space-y-0.5">
                    {g.milestones.map((m) => (
                      <li key={m.id}>
                        <button className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left text-[15px] hover:bg-[rgb(var(--line)/0.04)]"
                          onClick={async () => {
                            const after = await toggleMilestone(g.id, m.id);
                            if (after?.done && !g.done) { fireConfetti(); toast.show('Цель достигнута! 🏆', { undo: true }); }
                          }}>
                          <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', m.done ? 'border-transparent text-slate-950' : '')} style={{ borderColor: m.done ? undefined : g.color, background: m.done ? g.color : undefined }}>
                            {m.done && <CheckIcon size={13} strokeWidth={3} />}
                          </span>
                          <span className={cx('flex-1', m.done && 'text-muted line-through')}>{m.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {linked.length > 0 && <p className="mt-2 text-xs text-muted">Привычки: {linked.map((h) => `${h.emoji} ${h.title}`).join(', ')}</p>}
                {!g.milestones.length && !g.done && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Bar value={p} className="flex-1" />
                    {[-10, 10].map((dlt) => (
                      <Button key={dlt} size="sm" variant="soft" onClick={async () => {
                        const v = Math.max(0, Math.min(100, g.progress + dlt));
                        await updateGoal(g.id, { progress: v });
                        if (v === 100) { await completeGoal(g.id); fireConfetti(); }
                      }}>{dlt > 0 ? '+10%' : '−10%'}</Button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <GoalEditor goal={edit === 'new' ? null : edit} open={!!edit} onClose={() => setEdit(null)} />
    </>
  );
}

function GoalEditor({ goal, open, onClose }: { goal: Goal | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const blank = { title: '', why: '', emoji: '🎯', color: PALETTE[0], deadline: null as DateStr | null, milestones: [] as Goal['milestones'], progress: 0, done: false };
  const [d, setD] = useState(blank);
  const [newM, setNewM] = useState('');
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    setNewM('');
    if (open) setD(goal ? { title: goal.title, why: goal.why ?? '', emoji: goal.emoji ?? '🎯', color: goal.color, deadline: goal.deadline ?? null, milestones: goal.milestones, progress: goal.progress, done: goal.done } : blank);
  }
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const addM = () => { if (newM.trim()) { set('milestones', [...d.milestones, { id: uid(), title: newM.trim(), done: false }]); setNewM(''); } };
  const save = async () => {
    if (!d.title.trim()) { toast.show('Введите цель', { tone: 'error' }); return; }
    const milestones = newM.trim() ? [...d.milestones, { id: uid(), title: newM.trim(), done: false }] : d.milestones;
    const data = { title: d.title.trim(), why: d.why.trim() || undefined, emoji: d.emoji, color: d.color, deadline: d.deadline, milestones, progress: d.progress };
    if (goal) await updateGoal(goal.id, data);
    else await addGoal({ ...data, milestones: milestones.map((m) => m.title) });
    toast.show(goal ? 'Сохранено' : 'Цель добавлена ✓', { undo: true });
    onClose();
  };
  const t0 = today();
  return (
    <Sheet open={open} onClose={onClose} title={goal ? 'Цель' : 'Новая цель'} footer={
      <div className="flex gap-2">
        {goal && <Button variant="danger" size="icon" aria-label="Удалить цель" onClick={async () => { await deleteGoal(goal.id); toast.show('Цель в корзине', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        {goal && <Button variant="soft" onClick={async () => { await completeGoal(goal.id, !goal.done); if (!goal.done) fireConfetti(); onClose(); }}>{goal.done ? 'Вернуть в работу' : 'Достигнута 🏆'}</Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Input autoFocus={!goal} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Например: пробежать 10 км" aria-label="Цель" className="text-[17px] font-medium" />
        <Field label="Зачем мне это"><Textarea value={d.why} onChange={(e) => set('why', e.target.value)} placeholder="Чтобы… (видно на карточке — напоминает, ради чего)" className="!min-h-[64px]" /></Field>
        <div>
          <Label>Этапы</Label>
          <ul className="space-y-0.5">
            {d.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-1">
                <input value={m.title} onChange={(e) => set('milestones', d.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))} className={cx('min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none', m.done && 'text-muted line-through')} aria-label="Этап" />
                <button onClick={() => set('milestones', d.milestones.filter((x) => x.id !== m.id))} className="p-2 text-muted hover:text-red-400" aria-label="Удалить этап"><X size={16} /></button>
              </li>
            ))}
          </ul>
          <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); addM(); }}>
            <Input value={newM} onChange={(e) => setNewM(e.target.value)} placeholder="Добавить этап" className="!py-2" aria-label="Новый этап" />
            <Button type="submit" size="icon" variant="soft" aria-label="Добавить этап"><Plus size={18} /></Button>
          </form>
          {!d.milestones.length && <p className="mt-1 text-xs text-muted">Без этапов прогресс отмечается вручную (+10%).</p>}
        </div>
        <div>
          <Label>Срок</Label>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[['Месяц', addDays(t0, 30)], ['3 месяца', addDays(t0, 91)], ['Полгода', addDays(t0, 182)], ['Год', addDays(t0, 365)]].map(([l, v]) => (
              <Chip key={l} active={d.deadline === v} onClick={() => set('deadline', v)}>{l}</Chip>
            ))}
            <Chip active={!d.deadline} onClick={() => set('deadline', null)}>Без срока</Chip>
          </div>
          <Input type="date" className="mt-2" value={d.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} aria-label="Срок" />
        </div>
        <div><Label>Значок</Label><EmojiPicker value={d.emoji} onChange={(e) => set('emoji', e)} list={GOAL_EMOJI} /></div>
        <div>
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={d.color === c} onClick={() => set('color', c)} className="focus-ring h-9 w-9 rounded-full" style={{ background: c, boxShadow: d.color === c ? `0 0 0 3px ${c}66` : undefined }} />)}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
