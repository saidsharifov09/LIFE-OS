// Карточка человека: «что обсудить», последний контакт, день рождения (+ .ics), телефон, заметки, записи истории.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check as CheckIcon, MessageCircle, Phone, Plus, Star, Trash2, X } from 'lucide-react';
import type { Person } from '@/db/types';
import { addPerson, addTopic, deletePerson, logForPerson, markContact, removeTopic, toggleTopic, updatePerson } from '@/actions';
import { fmtRelative, MONTHS_GEN, today } from '@/lib/dates';
import { birthdayItem } from '@/lib/ics';
import { daysSinceContact, fmtBirthday, fmtSince, nextBirthday, validMmdd } from '@/lib/people';
import { PALETTE } from '@/lib/categories';
import { cx } from '@/lib/format';
import { Button, Chip, Field, Input, Label, Textarea } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { IcsButton } from '@/ui/IcsButton';
import { Avatar, birthdayText } from './shared';

export { Avatar, birthdayText };

export const RELATIONS = ['Семья', 'Друг', 'Партнёр', 'Работа', 'Учёба', 'Сосед'];
const CONTACT_EVERY = [{ v: 0, l: 'Не напоминать' }, { v: 7, l: 'Раз в неделю' }, { v: 14, l: 'Раз в 2 недели' }, { v: 30, l: 'Раз в месяц' }, { v: 90, l: 'Раз в 3 месяца' }];
const LOG_EMOJI: Record<string, string> = { note: '📝', place: '📍', activity: '⚡', people: '👥', learned: '💡', decision: '✅', evening: '🌙' };

interface Draft { name: string; relation: string; color: string; emoji: string; day: string; month: string; year: string; phone: string; notes: string; contactEvery: number; favorite: boolean }
const empty: Draft = { name: '', relation: '', color: PALETTE[0], emoji: '', day: '', month: '', year: '', phone: '', notes: '', contactEvery: 0, favorite: false };

function toDraft(p: Person): Draft {
  return {
    name: p.name, relation: p.relation ?? '', color: p.color, emoji: p.emoji ?? '',
    day: p.birthday ? String(Number(p.birthday.slice(3))) : '', month: p.birthday ? String(Number(p.birthday.slice(0, 2))) : '',
    year: p.birthYear ? String(p.birthYear) : '', phone: p.phone ?? '', notes: p.notes ?? '', contactEvery: p.contactEvery ?? 0, favorite: !!p.favorite,
  };
}

export function PersonSheet({ open, person, onClose }: { open: boolean; person: Person | null; onClose: () => void }) {
  const toast = useToast();
  const t0 = today();
  const [d, setD] = useState<Draft>(empty);
  const [topic, setTopic] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const key = open ? person?.id ?? 'new' : null;
  if (key !== last) {
    setLast(key);
    if (open) { setD(person ? toDraft(person) : empty); setTopic(''); }
  }
  const history = useLiveQuery(() => (person ? logForPerson(person.id, 5) : Promise.resolve([])), [person?.id]) ?? [];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const mmdd = d.day && d.month ? `${d.month.padStart(2, '0')}-${d.day.padStart(2, '0')}` : '';
  const badDate = !!mmdd && !validMmdd(mmdd);

  const save = async () => {
    if (!d.name.trim()) { toast.show('Введите имя', { tone: 'error' }); return; }
    if (badDate) { toast.show('Такой даты нет — проверьте день и месяц', { tone: 'error' }); return; }
    const year = Number(d.year);
    const data = {
      name: d.name, relation: d.relation.trim() || undefined, color: d.color, emoji: d.emoji || undefined,
      birthday: mmdd || null, birthYear: year || null, phone: d.phone.trim() || undefined, notes: d.notes.trim() || undefined,
      contactEvery: d.contactEvery || null, favorite: d.favorite,
    };
    if (person) await updatePerson(person.id, data);
    else await addPerson({ ...data, topics: topic.trim() ? [topic] : [] });
    toast.show(person ? 'Сохранено' : `${d.name.trim()} — добавлен(а) ✓`, { undo: true });
    onClose();
  };

  const addT = async () => {
    if (!person || !topic.trim()) return;
    await addTopic(person.id, topic);
    setTopic('');
  };

  const b = person ? nextBirthday(person, t0) : null;
  const since = person ? daysSinceContact(person, t0) : null;
  const openTopics = person?.topics.filter((x) => !x.done) ?? [];
  const doneTopics = person?.topics.filter((x) => x.done) ?? [];
  const tel = d.phone.replace(/[^\d+]/g, '');

  return (
    <Sheet open={open} onClose={onClose} wide title={person ? person.name : 'Новый человек'} footer={
      <div className="flex gap-2">
        {person && <Button variant="danger" size="icon" aria-label="Удалить" onClick={async () => { await deletePerson(person.id); toast.show('Удалено в корзину', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-5">
        {person && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={since === 0 ? 'soft' : 'primary'} icon={<CheckIcon size={15} />} onClick={async () => { await markContact(person.id); toast.show('Отмечено: общались сегодня', { undo: true }); }}>
              {since === 0 ? 'Общались сегодня' : 'Связались сегодня'}
            </Button>
            {tel && <a href={`tel:${tel}`} className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[rgb(var(--line)/0.07)] px-3 text-sm"><Phone size={15} /> Позвонить</a>}
            {b && <IcsButton label="ДР в Календарь" item={() => birthdayItem({ id: person.id, name: person.name, date: b.date })} />}
            <span className="w-full text-xs text-muted">
              Последний контакт: <b className="text-fg">{fmtSince(since)}</b>
              {b && <> · 🎂 {fmtBirthday(person.birthday!)} — <b className="text-fg">{birthdayText(b.daysLeft)}</b>{b.age !== null ? `, исполнится ${b.age}` : ''}</>}
            </span>
          </div>
        )}

        {person && (
          <div>
            <Label>Что обсудить или рассказать</Label>
            <ul className="space-y-1">
              {[...openTopics, ...doneTopics].map((x) => (
                <li key={x.id} className="flex items-center gap-2 rounded-xl px-1 py-0.5">
                  <button type="button" aria-label={x.done ? `Вернуть: ${x.text}` : `Обсудили: ${x.text}`} aria-pressed={x.done} onClick={() => toggleTopic(person.id, x.id)}
                    className={cx('focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-full transition', x.done ? 'bg-emerald-400 text-slate-950' : 'ring-2 ring-[rgb(var(--line)/0.3)]')}>
                    {x.done && <CheckIcon size={13} strokeWidth={3} />}
                  </button>
                  <span className={cx('flex-1 text-[15px]', x.done && 'text-muted line-through')}>{x.text}</span>
                  <button type="button" aria-label={`Убрать: ${x.text}`} onClick={() => removeTopic(person.id, x.id)} className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted hover:text-fg"><X size={15} /></button>
                </li>
              ))}
            </ul>
            <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); addT(); }}>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Рассказать про поездку, вернуть книгу…" aria-label="Что обсудить" className="!py-2.5" />
              <Button type="submit" size="icon" variant="soft" aria-label="Добавить тему" disabled={!topic.trim()}><Plus size={18} /></Button>
            </form>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя"><Input autoFocus={!person} value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Как зовут" /></Field>
          <Field label="Телефон"><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} type="tel" inputMode="tel" placeholder="+992…" /></Field>
        </div>

        <div>
          <Label>Кто это</Label>
          <div className="flex flex-wrap gap-1.5">
            {RELATIONS.map((r) => <Chip key={r} active={d.relation === r} onClick={() => set('relation', d.relation === r ? '' : r)}>{r}</Chip>)}
            <Input value={RELATIONS.includes(d.relation) ? '' : d.relation} onChange={(e) => set('relation', e.target.value)} placeholder="Своё…" aria-label="Кто это (своё)" className="!h-8 !w-32 !rounded-full !px-3 !py-0 !text-[14px]" />
          </div>
        </div>

        <div>
          <Label>День рождения</Label>
          <div className="flex gap-2">
            <select value={d.day} onChange={(e) => set('day', e.target.value)} aria-label="День" className="field !w-24 !py-2.5">
              <option value="">День</option>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
            <select value={d.month} onChange={(e) => set('month', e.target.value)} aria-label="Месяц" className="field flex-1 !py-2.5">
              <option value="">Месяц</option>
              {MONTHS_GEN.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <Input value={d.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Год" aria-label="Год рождения (необязательно)" className="!w-24 !py-2.5" />
          </div>
          {badDate ? <p className="mt-1 text-xs text-red-500 dark:text-red-300">Такой даты нет</p>
            : <p className="mt-1 text-xs text-muted">Год — по желанию (чтобы видеть, сколько исполнится). Напоминание — на главной за неделю; для системного — «ДР в Календарь».</p>}
          {(d.day || d.month) && <button type="button" className="mt-1 text-xs text-sky-600 dark:text-sky-300" onClick={() => setD({ ...d, day: '', month: '', year: '' })}>Убрать дату</button>}
        </div>

        <div>
          <Label>Напомнить связаться</Label>
          <div className="flex flex-wrap gap-1.5">
            {CONTACT_EVERY.map((c) => <Chip key={c.v} active={d.contactEvery === c.v} onClick={() => set('contactEvery', c.v)}>{c.l}</Chip>)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label className="!mb-0 w-full">Цвет</Label>
          {PALETTE.map((c) => <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={d.color === c} onClick={() => set('color', c)} className="focus-ring h-9 w-9 rounded-full" style={{ background: c, boxShadow: d.color === c ? `0 0 0 3px ${c}66` : undefined }} />)}
          <Button size="sm" variant={d.favorite ? 'primary' : 'soft'} aria-pressed={d.favorite} icon={<Star size={15} />} className="ml-auto" onClick={() => set('favorite', !d.favorite)}>Избранный</Button>
        </div>

        <Field label="Заметки"><Textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Любит, не любит, размер одежды, идеи подарков…" className="min-h-[72px]" /></Field>

        {!person && (
          <Field label="Что обсудить (можно потом)"><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Например: рассказать про новую работу" /></Field>
        )}

        {history.length > 0 && (
          <div>
            <Label>В истории</Label>
            <ul className="space-y-1 text-sm">
              {history.map((e) => (
                <li key={e.id} className="flex gap-2"><span aria-hidden>{LOG_EMOJI[e.kind] ?? '📝'}</span><span className="text-muted">{fmtRelative(e.date)}</span><span className="min-w-0 flex-1 truncate">{e.text}</span></li>
              ))}
            </ul>
          </div>
        )}
        {person && !history.length && (
          <p className="flex items-center gap-1.5 text-xs text-muted"><MessageCircle size={13} /> Запись в «Истории» с этим человеком тоже обновит последний контакт.</p>
        )}
      </div>
    </Sheet>
  );
}
