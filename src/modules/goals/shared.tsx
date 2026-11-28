// Общие элементы целей и привычек: кнопка отметки привычки (и для главной), выбор эмодзи и дней недели.
import { m } from 'framer-motion';
import { Flame } from 'lucide-react';
import type { Habit } from '@/db/types';
import { checkHabit } from '@/actions';
import { WEEKDAYS_SHORT } from '@/lib/dates';
import { cx } from '@/lib/format';
import { Chip } from '@/ui/primitives';
import { fireConfetti } from '@/ui/feedback';

export const HABIT_EMOJI = ['✅', '💧', '🏃', '🧘', '📚', '🪥', '💊', '🥗', '😴', '🚭', '📵', '🧹', '✍️', '🙏', '💪', '🚶', '🎯', '🧠', '🌅', '🍎', '💰', '🎸', '🗣️', '❤️'];
export const GOAL_EMOJI = ['🎯', '🏆', '📚', '💪', '💰', '✈️', '🏠', '🧠', '🗣️', '🎓', '💼', '❤️', '🌱', '🚗', '🎨', '⭐'];

/**
 * Кнопка привычки: касание = +1 (до цели дня), повторное касание выполненной — снять отметку.
 * onAllDone — вызвать, если после отметки все привычки дня выполнены (конфетти).
 */
export function HabitButton({ habit, count, streak, date, compact, onDone }: {
  habit: Habit; count: number; streak?: number; date?: string; compact?: boolean; onDone?: () => void;
}) {
  const done = count >= habit.target;
  const part = Math.min(1, count / habit.target);
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={`${habit.title}: ${done ? 'выполнено' : `${count} из ${habit.target}`}`}
      onClick={async () => {
        const n = await checkHabit(habit.id, date);
        if (n >= habit.target) onDone?.();
      }}
      className={cx(
        'focus-ring flex w-full items-center gap-3 rounded-2xl text-left transition active:scale-[0.98]',
        compact ? 'p-2' : 'p-2.5',
        done ? 'bg-emerald-400/12' : 'hover:bg-[rgb(var(--line)/0.05)]',
      )}
    >
      <span className="relative grid shrink-0 place-items-center" style={{ width: compact ? 40 : 46, height: compact ? 40 : 46 }}>
        <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
          <circle cx="20" cy="20" r="17" fill="none" stroke="rgb(var(--line) / 0.12)" strokeWidth="3" />
          <m.circle cx="20" cy="20" r="17" fill="none" stroke={habit.color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 17} initial={false} animate={{ strokeDashoffset: 2 * Math.PI * 17 * (1 - part) }} transition={{ duration: 0.35 }} />
        </svg>
        <m.span key={String(done)} initial={{ scale: done ? 0.6 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className={cx('text-xl leading-none', !done && 'opacity-80 grayscale-[35%]')}>{habit.emoji}</m.span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate font-medium', done && 'text-muted line-through decoration-1')}>{habit.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {habit.target > 1 && <span className="tabular-nums">{count}/{habit.target}</span>}
          {!!streak && <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300"><Flame size={12} />{streak}</span>}
          {done && <span className="text-emerald-700 dark:text-emerald-300">готово</span>}
        </span>
      </span>
    </button>
  );
}

/** Конфетти, когда отмечена последняя привычка дня */
export function celebrateIfAll(allDone: boolean) {
  if (allDone) fireConfetti();
}

export function EmojiPicker({ value, onChange, list }: { value: string; onChange: (e: string) => void; list: string[] }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {list.map((e) => (
        <button key={e} type="button" onClick={() => onChange(e)} aria-label={`Значок ${e}`} aria-pressed={value === e}
          className={cx('focus-ring grid aspect-square place-items-center rounded-xl text-xl transition', value === e ? 'bg-sky-400/20 ring-1 ring-sky-400/60' : 'bg-[rgb(var(--line)/0.05)] hover:bg-[rgb(var(--line)/0.1)]')}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function DaysPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  const every = value.length === 0 || value.length === 7;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={every} onClick={() => onChange([])}>Каждый день</Chip>
      {WEEKDAYS_SHORT.map((w, i) => {
        const on = !every && value.includes(i);
        return (
          <Chip key={w} active={on} onClick={() => {
            const base = every ? [] : value;
            const next = on ? base.filter((x) => x !== i) : [...base, i].sort();
            onChange(next.length === 7 ? [] : next);
          }}>{w}</Chip>
        );
      })}
    </div>
  );
}

export function describeDays(days: number[]): string {
  if (!days.length || days.length === 7) return 'каждый день';
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) return 'по будням';
  return days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
}
