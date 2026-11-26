// Выбор повторения: нет / день / неделя (с днями) / месяц / год + интервал
import type { DateStr, Recurrence } from '@/db/types';
import { weekday, WEEKDAYS_SHORT } from '@/lib/dates';
import { cx } from '@/lib/format';
import { Chip, Input, Label } from './primitives';

type RecKind = 'none' | Recurrence['freq'];

export function RecurrencePicker({ value, onChange, date }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void; date: DateStr }) {
  const kind: RecKind = value?.freq ?? 'none';
  return (
    <div>
      <Label>Повтор</Label>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {([['none', 'Нет'], ['daily', 'Каждый день'], ['weekly', 'По неделям'], ['monthly', 'Каждый месяц'], ['yearly', 'Каждый год']] as [RecKind, string][]).map(([k, l]) => (
          <Chip key={k} active={kind === k} onClick={() => onChange(k === 'none' ? null : { freq: k, interval: 1, days: k === 'weekly' ? [weekday(date)] : undefined })}>{l}</Chip>
        ))}
      </div>
      {value && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Каждые</span>
          <Input type="number" min={1} max={99} value={value.interval} onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })} className="!w-20 !py-2" aria-label="Интервал" />
          {value.freq === 'weekly' && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS_SHORT.map((w, i) => {
                const on = value.days?.includes(i);
                return (
                  <button key={w} type="button" aria-pressed={on} onClick={() => {
                    const days = on ? value.days!.filter((x) => x !== i) : [...(value.days ?? []), i].sort();
                    onChange({ ...value, days: days.length ? days : [i] });
                  }} className={cx('focus-ring h-9 w-9 rounded-xl text-xs font-semibold', on ? 'grad-accent text-slate-950' : 'bg-[rgb(var(--line)/0.07)] text-muted')}>{w}</button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
