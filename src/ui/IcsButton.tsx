// Кнопка «В Календарь iPhone»: выбор напоминаний → файл .ics.
// Календарь iPhone напомнит сам, даже когда Life OS закрыт.
import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { ALLDAY_ALARMS, buildICS, icsFileName, TIMED_ALARMS, type IcsItem } from '@/lib/ics';
import { downloadFile } from '@/lib/share';
import { Button, Chip, Label } from './primitives';
import { Sheet, useToast } from './overlay';

export function IcsButton({ item, defaultAlarms, className, label = 'В Календарь iPhone' }: {
  /** Пункт без напоминаний — их выбирают в окне */
  item: () => Omit<IcsItem, 'alarms'> | null;
  defaultAlarms?: number[];
  className?: string;
  label?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<Omit<IcsItem, 'alarms'> | null>(null);
  const [alarms, setAlarms] = useState<number[]>([]);
  const timed = !!open?.start;
  const options = timed ? TIMED_ALARMS : ALLDAY_ALARMS;

  const start = () => {
    const it = item();
    if (!it) { toast.show('Сначала укажите дату', { tone: 'error' }); return; }
    setAlarms(defaultAlarms ?? (it.start ? [-15] : [9 * 60, 9 * 60 - 1440]));
    setOpen(it);
  };

  const save = () => {
    if (!open) return;
    const text = buildICS([{ ...open, alarms }]);
    // .ics открываем обычной загрузкой: Safari на iPhone сразу предлагает «Добавить в Календарь»
    downloadFile(new File([text], icsFileName(open.title), { type: 'text/calendar' }));
    setOpen(null);
    toast.show('Файл календаря готов — подтвердите «Добавить»');
  };

  const toggle = (v: number) => setAlarms((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]));

  return (
    <>
      <Button size="sm" variant="soft" icon={<CalendarPlus size={15} />} className={className} onClick={start}>{label}</Button>
      <Sheet open={!!open} onClose={() => setOpen(null)} title="В Календарь iPhone" footer={
        <Button variant="primary" className="w-full" onClick={save}>Добавить в календарь</Button>
      }>
        {open && (
          <div className="space-y-4">
            <p className="font-medium">{open.title}</p>
            <div>
              <Label>Напомнить (можно несколько)</Label>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => <Chip key={o.value} active={alarms.includes(o.value)} onClick={() => toggle(o.value)}>{o.label}</Chip>)}
              </div>
            </div>
            <p className="text-sm text-muted">
              Календарь iPhone напомнит сам, даже если Life OS закрыт. Изменения в Life OS в календарь не переносятся —
              при переносе дела добавьте его заново.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
