// «История» (Life Log): лента дней — где был, что делал, с кем, что узнал, какие решения принял.
// Геолокация НЕ отслеживается: место — просто текстом.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Send, Trash2 } from 'lucide-react';
import type { LogEntry, LogKind, Person } from '@/db/types';
import { addLogEntry, deleteLogEntry, listPeople, logRange, updateLogEntry } from '@/actions';
import { addDays, fmtDayLong, fmtRelative, nowTime, today } from '@/lib/dates';
import { cx, plural } from '@/lib/format';
import { Button, Card, Chip, Empty, Field, Input, Label, PageHeader, Textarea } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { Linkify } from '@/ui/Linkify';
import { MOODS } from '@/modules/health/moods';

export const LOG_KINDS: { id: LogKind; emoji: string; name: string; hint: string }[] = [
  { id: 'activity', emoji: '⚡', name: 'Делал', hint: 'Что делал? Например: убрался в комнате' },
  { id: 'place', emoji: '📍', name: 'Где был', hint: 'Где был? Например: парк Рудаки' },
  { id: 'people', emoji: '👥', name: 'С кем', hint: 'С кем виделся или говорил?' },
  { id: 'learned', emoji: '💡', name: 'Узнал', hint: 'Что узнал нового?' },
  { id: 'decision', emoji: '✅', name: 'Решил', hint: 'Какое решение принял?' },
  { id: 'note', emoji: '📝', name: 'Заметка', hint: 'Что хочется запомнить?' },
];
const EVENING = { id: 'evening' as const, emoji: '🌙', name: 'Итог дня', hint: '' };
const kindInfo = (k: LogKind) => LOG_KINDS.find((x) => x.id === k) ?? EVENING;
const PAGE = 14;

export default function LogPage() {
  const toast = useToast();
  const t0 = today();
  const [days, setDays] = useState(PAGE);
  const [filter, setFilter] = useState<LogKind | null>(null);
  const [kind, setKind] = useState<LogKind>('activity');
  const [text, setText] = useState('');
  const [date, setDate] = useState(t0);
  const [who, setWho] = useState<string[]>([]);
  const [edit, setEdit] = useState<LogEntry | null>(null);
  const from = addDays(t0, -(days - 1));
  const entries = useLiveQuery(() => logRange(from, '9999-12-31'), [from]);
  const older = useLiveQuery(async () => (await logRange('0000-01-01', addDays(from, -1))).length, [from]) ?? 0;
  const people = useLiveQuery(() => listPeople(), []) ?? [];
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const groups = useMemo(() => {
    const m = new Map<string, LogEntry[]>();
    for (const e of entries ?? []) if (!filter || e.kind === filter) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [entries, filter]);

  const add = async () => {
    if (!text.trim()) return;
    await addLogEntry({ text, kind, date, time: date === t0 ? nowTime() : null, personIds: who });
    toast.show(who.length ? 'Записано · последний контакт обновлён' : 'Записано в историю ✓', { undo: true });
    setText('');
    setWho([]);
  };

  return (
    <>
      <PageHeader title="История" subtitle="Лента вашей жизни" />
      <Card className="mb-5">
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {LOG_KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.emoji} {k.name}</Chip>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex items-end gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={kindInfo(kind).hint} aria-label="Запись в историю" rows={1}
            className="!min-h-[48px] flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } }} />
          <Button type="submit" variant="primary" size="icon" aria-label="Записать" disabled={!text.trim()} className="!h-12 !w-12"><Send size={18} /></Button>
        </form>
        {people.length > 0 && (kind === 'people' || who.length > 0) && (
          <PeoplePicker people={people} value={who} onChange={setWho} className="mt-3" />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <Chip active={date === t0} onClick={() => setDate(t0)}>Сегодня</Chip>
          <Chip active={date === addDays(t0, -1)} onClick={() => setDate(addDays(t0, -1))}>Вчера</Chip>
          <input type="date" value={date} max={t0} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Дата записи" className="field !h-8 !w-auto !rounded-full !px-3 !py-0 !text-[13px]" />
          {kind !== 'people' && people.length > 0 && !who.length && <Chip onClick={() => setKind('people')}>👥 С кем…</Chip>}
        </div>
        <p className="mt-2 text-xs text-muted">Геолокация не отслеживается — место пишите словами.</p>
      </Card>

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip active={!filter} onClick={() => setFilter(null)}>Все</Chip>
        {[...LOG_KINDS, EVENING].map((k) => <Chip key={k.id} active={filter === k.id} onClick={() => setFilter(filter === k.id ? null : k.id)}>{k.emoji} {k.name}</Chip>)}
      </div>

      {!entries ? <div className="h-40" /> : groups.length === 0 ? (
        <Card>
          <Empty icon={<History size={26} />} title={filter ? 'Таких записей пока нет' : 'Лента пуста'}
            hint="Пара слов в день — и через месяц будет что вспомнить. Итог дня из вечернего отчёта тоже попадает сюда." />
        </Card>
      ) : (
        <ol className="relative space-y-5 lg:max-w-3xl">
          {groups.map(([d, list]) => (
            <li key={d}>
              <h2 className="mb-2 flex items-baseline gap-2 font-semibold">
                {fmtRelative(d).includes(',') ? fmtDayLong(d) : <>{fmtRelative(d)}<span className="text-sm font-normal text-muted">{fmtDayLong(d)}</span></>}
                <span className="ml-auto text-xs font-normal text-muted">{list.length} {plural(list.length, ['запись', 'записи', 'записей'])}</span>
              </h2>
              <ul className="glass divide-y divide-[rgb(var(--line)/0.08)] rounded-3xl">
                <AnimatePresence initial={false}>
                  {list.map((e) => {
                    const k = kindInfo(e.kind);
                    const mood = e.mood ? MOODS.find((m) => m.v === e.mood) : null;
                    const names = (e.personIds ?? []).map((id) => byId.get(id)?.name).filter(Boolean);
                    return (
                      <motion.li key={e.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div role="button" tabIndex={0} onClick={() => setEdit(e)} onKeyDown={(ev) => ev.key === 'Enter' && setEdit(e)}
                          className="focus-ring flex cursor-pointer gap-3 px-4 py-3 text-left transition hover:bg-[rgb(var(--line)/0.04)]">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--line)/0.06)] text-lg" title={k.name}>{k.emoji}</span>
                          <span className="min-w-0 flex-1">
                            <Linkify text={e.text} className="block text-[15px]" />
                            <span className="mt-0.5 block text-xs text-muted">
                              {[e.time, names.length ? `${e.kind === 'people' ? '' : `${k.name} · `}с ${names.join(', ')}` : k.name, mood ? `${mood.e} ${mood.l}` : null].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </li>
          ))}
        </ol>
      )}
      {older > 0 && (
        <div className="mt-5 text-center">
          <Button variant="soft" onClick={() => setDays(days + PAGE * 2)}>Показать раньше ({older})</Button>
        </div>
      )}
      <LogEditor entry={edit} people={people} onClose={() => setEdit(null)} />
    </>
  );
}

export function PeoplePicker({ people, value, onChange, className }: { people: Person[]; value: string[]; onChange: (v: string[]) => void; className?: string }) {
  return (
    <div className={className}>
      <Label>С кем</Label>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <Chip key={p.id} color={p.color} active={value.includes(p.id)} onClick={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])}>{p.name}</Chip>
        ))}
      </div>
    </div>
  );
}

function LogEditor({ entry, people, onClose }: { entry: LogEntry | null; people: Person[]; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ text: '', kind: 'note' as LogKind, date: today(), time: '', who: [] as string[] });
  const [last, setLast] = useState<string | null>(null);
  if ((entry?.id ?? null) !== last) {
    setLast(entry?.id ?? null);
    if (entry) setD({ text: entry.text, kind: entry.kind, date: entry.date, time: entry.time ?? '', who: entry.personIds ?? [] });
  }
  const save = async () => {
    if (!entry) return;
    if (!d.text.trim()) { toast.show('Запись пустая', { tone: 'error' }); return; }
    await updateLogEntry(entry.id, { text: d.text.trim(), kind: d.kind, date: d.date || entry.date, time: d.time || null, personIds: d.who.length ? d.who : undefined });
    toast.show('Сохранено', { undo: true });
    onClose();
  };
  return (
    <Sheet open={!!entry} onClose={onClose} title="Запись истории" footer={
      <div className="flex gap-2">
        {entry && <Button variant="danger" size="icon" aria-label="Удалить запись" onClick={async () => { await deleteLogEntry(entry.id); toast.show('Запись в корзине', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Textarea value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} aria-label="Текст записи" />
        <div>
          <Label>Что это</Label>
          <div className="flex flex-wrap gap-1.5">
            {[...LOG_KINDS, ...(d.kind === 'evening' ? [EVENING] : [])].map((k) => <Chip key={k.id} active={d.kind === k.id} onClick={() => setD({ ...d, kind: k.id })}>{k.emoji} {k.name}</Chip>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата"><Input type="date" value={d.date} max={today()} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <Field label="Время"><Input type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} /></Field>
        </div>
        {people.length > 0 && <PeoplePicker people={people} value={d.who} onChange={(who) => setD({ ...d, who })} />}
        <p className={cx('text-xs text-muted')}>Отметка людей обновляет их «последний контакт».</p>
      </div>
    </Sheet>
  );
}
