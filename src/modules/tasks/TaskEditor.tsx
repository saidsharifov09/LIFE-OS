// Редактор задачи (создание и изменение) в нижней шторке.
import { useEffect, useState } from 'react';
import { CalendarPlus, Plus, Star, Trash2, X } from 'lucide-react';
import type { DateStr, Priority, Recurrence, Subtask, Task } from '@/db/types';
import { addTask, deleteTask, eventFromTask, setTop, updateTask } from '@/actions';
import { addDays, today, weekday } from '@/lib/dates';
import { RecurrencePicker } from '@/ui/RecurrencePicker';
import { TASK_CATEGORIES } from '@/lib/categories';
import { uid } from '@/lib/id';
import { cx } from '@/lib/format';
import { Button, Chip, Field, Input, Label, Segmented, Textarea } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { Check } from '@/ui/feedback';
import { IcsButton } from '@/ui/IcsButton';
import { PRIORITY_LABELS } from './TaskItem';

export interface TaskDraft {
  title: string;
  notes: string;
  date: DateStr | null;
  time: string | null;
  priority: Priority;
  category: string | null;
  subtasks: Subtask[];
  recurrence: Recurrence | null;
}

const empty = (date: DateStr | null = null): TaskDraft => ({
  title: '', notes: '', date, time: null, priority: 0, category: null, subtasks: [], recurrence: null,
});

export function TaskEditor({ task, open, onClose, defaultDate }: {
  task?: Task | null; open: boolean; onClose: () => void; defaultDate?: DateStr | null;
}) {
  const toast = useToast();
  const [d, setD] = useState<TaskDraft>(empty());
  const [newSub, setNewSub] = useState('');

  useEffect(() => {
    if (!open) return;
    setNewSub('');
    setD(task ? {
      title: task.title, notes: task.notes ?? '', date: task.date ?? null, time: task.time ?? null,
      priority: task.priority, category: task.category ?? null, subtasks: task.subtasks, recurrence: task.recurrence ?? null,
    } : empty(defaultDate ?? null));
  }, [open, task, defaultDate]);

  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!d.title.trim()) { toast.show('Введите название', { tone: 'error' }); return; }
    const subtasks = newSub.trim() ? [...d.subtasks, { id: uid(), title: newSub.trim(), done: false }] : d.subtasks;
    const data = { ...d, subtasks, recurrence: d.date ? d.recurrence : null };
    if (task) await updateTask(task.id, data);
    else await addTask(data);
    toast.show(task ? 'Сохранено' : 'Задача добавлена ✓', { undo: true });
    onClose();
  };

  const t0 = today();
  const quickDates: { label: string; value: DateStr | null }[] = [
    { label: 'Сегодня', value: t0 },
    { label: 'Завтра', value: addDays(t0, 1) },
    { label: 'Выходные', value: addDays(t0, (5 - weekday(t0) + 7) % 7 || 7) },
    { label: 'След. неделя', value: addDays(t0, 7 - weekday(t0)) },
    { label: 'Без даты', value: null },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={task ? 'Задача' : 'Новая задача'}
      footer={
        <div className="flex gap-2">
          {task && (
            <Button variant="danger" size="icon" aria-label="Удалить задачу" onClick={async () => { await deleteTask(task.id); toast.show('Задача в корзине', { undo: true }); onClose(); }}>
              <Trash2 size={18} />
            </Button>
          )}
          <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus={!task}
          value={d.title}
          onChange={(e) => set('title', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Что сделать?"
          aria-label="Название"
          className="text-[17px] font-medium"
        />

        <div>
          <Label>Когда</Label>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {quickDates.map((q) => (
              <Chip key={q.label} active={d.date === q.value} onClick={() => set('date', q.value)}>{q.label}</Chip>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input type="date" value={d.date ?? ''} onChange={(e) => set('date', e.target.value || null)} aria-label="Дата" />
            <div className="relative">
              <Input type="time" value={d.time ?? ''} onChange={(e) => set('time', e.target.value || null)} aria-label="Время" disabled={!d.date} />
              {d.time && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted" onClick={() => set('time', null)} aria-label="Убрать время"><X size={16} /></button>
              )}
            </div>
          </div>
        </div>

        {d.date && <RecurrencePicker value={d.recurrence} onChange={(r) => set('recurrence', r)} date={d.date} />}

        <div>
          <Label>Приоритет</Label>
          <Segmented value={String(d.priority)} onChange={(v) => set('priority', Number(v) as Priority)} options={PRIORITY_LABELS.map((l, i) => ({ value: String(i), label: l }))} />
        </div>

        <div>
          <Label>Категория</Label>
          <div className="flex flex-wrap gap-2">
            {TASK_CATEGORIES.map((c) => (
              <Chip key={c.id} color={c.color} active={d.category === c.id} onClick={() => set('category', d.category === c.id ? null : c.id)}>{c.name}</Chip>
            ))}
          </div>
        </div>

        <div>
          <Label>Подзадачи</Label>
          <ul className="space-y-0.5">
            {d.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-1">
                <Check size={20} checked={s.done} label={s.title} onChange={() => set('subtasks', d.subtasks.map((x) => x.id === s.id ? { ...x, done: !x.done } : x))} />
                <input value={s.title} onChange={(e) => set('subtasks', d.subtasks.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} className={cx('min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none', s.done && 'text-muted line-through')} aria-label="Подзадача" />
                <button onClick={() => set('subtasks', d.subtasks.filter((x) => x.id !== s.id))} className="p-2 text-muted hover:text-red-400" aria-label="Удалить подзадачу"><X size={16} /></button>
              </li>
            ))}
          </ul>
          <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newSub.trim()) { set('subtasks', [...d.subtasks, { id: uid(), title: newSub.trim(), done: false }]); setNewSub(''); } }}>
            <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Добавить подзадачу" className="!py-2" aria-label="Новая подзадача" />
            <Button type="submit" size="icon" variant="soft" aria-label="Добавить"><Plus size={18} /></Button>
          </form>
        </div>

        <Field label="Описание">
          <Textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Детали, ссылки, мысли…" />
        </Field>

        {task && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={<Star size={15} className={task.topDate === t0 ? 'fill-amber-300 text-amber-300' : ''} />}
              onClick={async () => { await setTop(task.id, task.topDate === t0 ? null : t0); onClose(); }}>
              {task.topDate === t0 ? 'Убрать из главных' : 'В 3 главных на сегодня'}
            </Button>
            {d.date && (
              <IcsButton item={() => (d.date ? {
                uid: `task-${task.id}`, title: d.title.trim() || task.title, description: d.notes || undefined,
                date: d.date, start: d.time, duration: 30, recurrence: d.recurrence,
              } : null)} />
            )}
            {!task.eventId && (
              <Button size="sm" variant="soft" icon={<CalendarPlus size={15} />}
                onClick={async () => { await eventFromTask(task.id); toast.show('Событие создано в календаре', { undo: true }); onClose(); }}>
                В календарь
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
