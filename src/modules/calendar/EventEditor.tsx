// Редактор события календаря
import { useEffect, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import type { CalendarEvent, DateStr, Recurrence } from '@/db/types';
import { addEvent, deleteEvent, skipOccurrence, updateEvent } from '@/actions';
import { db } from '@/db/db';
import { fmtRelative, today } from '@/lib/dates';
import { PALETTE } from '@/lib/categories';
import { cx } from '@/lib/format';
import { Button, Chip, Field, Input, Label, Switch, Textarea } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { RecurrencePicker } from '@/ui/RecurrencePicker';

interface Draft {
  title: string; date: DateStr; allDay: boolean; start: string; duration: number;
  color: string; recurrence: Recurrence | null; notes: string; remind: number;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const REMINDS = [{ v: -1, l: 'Нет' }, { v: 0, l: 'В момент' }, { v: 5, l: '5 мин' }, { v: 15, l: '15 мин' }, { v: 30, l: '30 мин' }, { v: 60, l: '1 час' }, { v: 120, l: '2 часа' }];

export function EventEditor({ event, occurrenceDate, open, onClose, defaults }: {
  event?: CalendarEvent | null;
  /** Дата конкретного вхождения повторяющегося события */
  occurrenceDate?: DateStr;
  open: boolean;
  onClose: () => void;
  defaults?: { date?: DateStr; start?: string };
}) {
  const toast = useToast();
  const [d, setD] = useState<Draft | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDel(false);
    setD(event ? {
      title: event.title, date: event.date, allDay: !event.start, start: event.start ?? '10:00', duration: event.duration || 60,
      color: event.color, recurrence: event.recurrence ?? null, notes: event.notes ?? '', remind: event.remind?.[0] ?? -1,
    } : {
      title: '', date: defaults?.date ?? today(), allDay: false, start: defaults?.start ?? '10:00', duration: 60,
      color: PALETTE[0], recurrence: null, notes: '', remind: 15,
    });
    setTaskTitle(null);
    if (event?.taskId) db.tasks.get(event.taskId).then((t) => setTaskTitle(t && !t.deletedAt ? t.title : null));
  }, [open, event, defaults?.date, defaults?.start]);

  if (!d) return null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));

  const save = async () => {
    if (!d.title.trim()) { toast.show('Введите название', { tone: 'error' }); return; }
    const data = {
      title: d.title.trim(), date: d.date, start: d.allDay ? null : d.start, duration: d.allDay ? 0 : d.duration,
      color: d.color, recurrence: d.recurrence, notes: d.notes, remind: d.remind >= 0 ? [d.remind] : [],
    };
    if (event) await updateEvent(event.id, data);
    else await addEvent(data);
    toast.show(event ? 'Сохранено' : 'Событие добавлено ✓', { undo: true });
    onClose();
  };

  const remove = async (onlyThis: boolean) => {
    if (!event) return;
    if (onlyThis && occurrenceDate) await skipOccurrence(event.id, occurrenceDate);
    else await deleteEvent(event.id);
    toast.show('Событие удалено', { undo: true });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={event ? 'Событие' : 'Новое событие'}
      footer={
        confirmDel && event?.recurrence ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" className="flex-1" onClick={() => remove(true)}>Только {occurrenceDate ? fmtRelative(occurrenceDate).toLowerCase() : 'это'}</Button>
            <Button variant="danger" className="flex-1" onClick={() => remove(false)}>Всю серию</Button>
            <Button variant="soft" onClick={() => setConfirmDel(false)}>Отмена</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            {event && (
              <Button variant="danger" size="icon" aria-label="Удалить событие" onClick={() => (event.recurrence ? setConfirmDel(true) : remove(false))}>
                <Trash2 size={18} />
              </Button>
            )}
            <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <Input autoFocus={!event} value={d.title} onChange={(e) => set('title', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Название события" aria-label="Название" className="text-[17px] font-medium" />
        {taskTitle && (
          <p className="flex items-center gap-2 text-sm text-muted"><Link2 size={14} /> Связано с задачей «{taskTitle}»</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Дата"><Input type="date" value={d.date} onChange={(e) => e.target.value && set('date', e.target.value)} /></Field>
          <Field label="Начало"><Input type="time" value={d.start} disabled={d.allDay} onChange={(e) => e.target.value && set('start', e.target.value)} /></Field>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-medium">Весь день</span>
          <Switch checked={d.allDay} onChange={(v) => set('allDay', v)} label="Весь день" />
        </div>
        {!d.allDay && (
          <div>
            <Label>Длительность</Label>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {DURATIONS.map((m) => (
                <Chip key={m} active={d.duration === m} onClick={() => set('duration', m)}>{m < 60 ? `${m} мин` : `${m / 60} ч`}</Chip>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => set('color', c)} aria-label={`Цвет ${c}`} aria-pressed={d.color === c}
                className={cx('focus-ring h-9 w-9 rounded-full transition', d.color === c && 'ring-2 ring-offset-2 ring-offset-transparent')}
                style={{ background: c, boxShadow: d.color === c ? `0 0 0 3px ${c}66` : undefined }} />
            ))}
          </div>
        </div>
        <RecurrencePicker value={d.recurrence} onChange={(r) => set('recurrence', r)} date={d.date} />
        <div>
          <Label>Напомнить (пока приложение открыто)</Label>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {REMINDS.map((r) => <Chip key={r.v} active={d.remind === r.v} onClick={() => set('remind', r.v)}>{r.l}</Chip>)}
          </div>
        </div>
        <Field label="Заметки"><Textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Адрес, ссылка, что взять…" /></Field>
      </div>
    </Sheet>
  );
}
