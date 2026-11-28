// Строка задачи — используется на главной, в «Задачах», в обзорах дня.
import { m } from 'framer-motion';
import { ArrowRight, CalendarDays, Clock, Flag, ListChecks, Repeat, Star } from 'lucide-react';
import type { Task } from '@/db/types';
import { completeTask, getDay, moveTask } from '@/actions';
import { addDays, fmtRelative, today } from '@/lib/dates';
import { findCategory } from '@/lib/categories';
import { cx } from '@/lib/format';
import { Check, fireConfetti } from '@/ui/feedback';
import { useToast } from '@/ui/overlay';

export const PRIORITY_COLORS = ['', '#38bdf8', '#fbbf24', '#f87171'];
export const PRIORITY_LABELS = ['Нет', 'Низкий', 'Средний', 'Высокий'];

const recent: number[] = [];

/** Выполнение задачи с откликом: тост «Отменить», конфетти за серию из 3 или за 100% дня */
export function useComplete() {
  const toast = useToast();
  return async (t: Task) => {
    const done = !t.done;
    await completeTask(t.id, done);
    if (!done) return;
    const now = Date.now();
    recent.push(now);
    while (recent.length && now - recent[0] > 3 * 60000) recent.shift();
    const day = await getDay();
    if (day.progress.total > 1 && day.progress.percent === 100) {
      fireConfetti();
      toast.show('Все задачи на сегодня выполнены! 🎉', { undo: true });
    } else if (recent.length >= 3 && recent.length % 3 === 0) {
      fireConfetti();
      toast.show(`Серия: ${recent.length} подряд! 🔥`, { undo: true });
    } else {
      toast.show('Готово ✓', { undo: true });
    }
  };
}

export function TaskItem({ task, onOpen, showDate = true, compact }: {
  task: Task; onOpen?: (t: Task) => void; showDate?: boolean; compact?: boolean;
}) {
  const complete = useComplete();
  const toast = useToast();
  const cat = findCategory(task.category, 'task');
  const overdue = !task.done && task.date && task.date < today();
  const subDone = task.subtasks.filter((s) => s.done).length;

  return (
    <m.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      className={cx('group flex items-center gap-1 rounded-2xl pr-2 transition-colors hover:bg-[rgb(var(--line)/0.04)]', compact ? 'py-0.5' : 'py-1')}
    >
      <Check checked={task.done} onChange={() => complete(task)} label={`Выполнить: ${task.title}`} color={cat?.color ?? '#2dd4bf'} size={compact ? 22 : 24} />
      <button
        type="button"
        onClick={() => onOpen?.(task)}
        className="focus-ring min-w-0 flex-1 rounded-lg py-1.5 text-left"
      >
        <div className={cx('truncate text-[15px] leading-snug transition', task.done && 'text-muted line-through decoration-1')}>
          {task.topDate === today() && <Star size={13} className="-mt-0.5 mr-1 inline fill-amber-300 text-amber-300" aria-label="Главный приоритет" />}
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted">
          {showDate && task.date && (
            <span className={cx('inline-flex items-center gap-1', overdue && 'font-medium text-red-700 dark:text-red-400')}>
              <CalendarDays size={12} />{fmtRelative(task.date)}
            </span>
          )}
          {task.time && <span className="inline-flex items-center gap-1"><Clock size={12} />{task.time}</span>}
          {task.priority > 0 && <span className="inline-flex items-center gap-1"><Flag size={12} style={{ color: PRIORITY_COLORS[task.priority] }} />{PRIORITY_LABELS[task.priority]}</span>}
          {task.subtasks.length > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} />{subDone}/{task.subtasks.length}</span>}
          {task.recurrence && <Repeat size={12} aria-label="Повторяется" />}
          {cat && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}</span>}
        </div>
      </button>
      {!task.done && (
        <button
          type="button"
          onClick={async () => {
            const target = task.date && task.date >= today() ? addDays(task.date, 1) : addDays(today(), 1);
            await moveTask(task.id, target);
            toast.show(`Перенесено: ${fmtRelative(target).toLowerCase()}`, { undo: true });
          }}
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted opacity-70 transition hover:bg-[rgb(var(--line)/0.07)] hover:text-fg hover:opacity-100"
          aria-label="Перенести на день вперёд"
          title="Перенести на день вперёд"
        >
          <ArrowRight size={17} />
        </button>
      )}
    </m.li>
  );
}
