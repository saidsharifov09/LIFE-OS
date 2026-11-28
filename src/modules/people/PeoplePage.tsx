// «Люди»: близкие, дни рождения (напоминание на главной и .ics в Календарь iPhone), «что обсудить», последний контакт.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cake, MessageCircle, Phone, Plus, Search, Star, Users } from 'lucide-react';
import type { Person } from '@/db/types';
import { listPeople, markContact } from '@/actions';
import { today } from '@/lib/dates';
import { contactDue, daysSinceContact, fmtBirthday, fmtSince, nextBirthday } from '@/lib/people';
import { cx, plural } from '@/lib/format';
import { Button, Card, Empty, Input, PageHeader } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { useOpenParam } from '@/app/useOpenParam';
import { PersonSheet } from './PersonSheet';
import { Avatar, birthdayText } from './shared';

export default function PeoplePage() {
  const toast = useToast();
  const t0 = today();
  const people = useLiveQuery(() => listPeople(), []);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [q, setQ] = useState('');
  useOpenParam('open', (id) => { if (!people) return false; if (people.some((p) => p.id === id)) setOpen(id); });
  if (!people) return <div className="h-40" />;

  const bdays = people.map((p) => ({ p, b: nextBirthday(p, t0) })).filter((x) => x.b && x.b.daysLeft <= 30).sort((a, b) => a.b!.daysLeft - b.b!.daysLeft);
  const due = people.filter((p) => contactDue(p, t0)).sort((a, b) => (daysSinceContact(b, t0) ?? 1e9) - (daysSinceContact(a, t0) ?? 1e9));
  const query = q.trim().toLowerCase();
  const shown = people.filter((p) => !query || `${p.name} ${p.relation ?? ''}`.toLowerCase().includes(query));
  const current = open && open !== 'new' ? people.find((p) => p.id === open) ?? null : null;

  return (
    <>
      <PageHeader title="Люди" action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setOpen('new')}>Человек</Button>} />
      {people.length === 0 ? (
        <Card>
          <Empty icon={<Users size={26} />} title="Добавьте близких"
            hint="Дни рождения напомнят о себе на главной, а «что обсудить» не даст забыть важное при встрече."
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen('new')}>Добавить человека</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3 lg:order-2">
            {bdays.length > 0 && (
              <Card title="Дни рождения" icon={<Cake size={18} />}>
                <ul className="space-y-1">
                  {bdays.map(({ p, b }) => (
                    <li key={p.id}>
                      <button onClick={() => setOpen(p.id)} className={cx('focus-ring flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-[rgb(var(--line)/0.05)]', b!.daysLeft === 0 && 'bg-pink-400/12')}>
                        <Avatar p={p} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block text-xs text-muted">{fmtBirthday(p.birthday!)}{b!.age !== null ? ` · исполнится ${b!.age}` : ''}</span>
                        </span>
                        <span className={cx('shrink-0 text-sm font-semibold', b!.daysLeft === 0 ? 'text-pink-600 dark:text-pink-300' : b!.daysLeft <= 7 ? 'text-amber-700 dark:text-amber-300' : 'text-muted')}>{birthdayText(b!.daysLeft)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {due.length > 0 && (
              <Card title="Давно не общались" icon={<MessageCircle size={18} />}>
                <ul className="space-y-1">
                  {due.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <button onClick={() => setOpen(p.id)} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-left hover:bg-[rgb(var(--line)/0.05)]">
                        <Avatar p={p} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block text-xs text-muted">Контакт: {fmtSince(daysSinceContact(p, t0))}</span>
                        </span>
                      </button>
                      <Button size="sm" variant="soft" onClick={async () => { await markContact(p.id); toast.show(`Отмечено: общались с ${p.name}`, { undo: true }); }}>Связались ✓</Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="lg:order-1">
            {people.length > 6 && (
              <div className="relative mb-3">
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти человека" aria-label="Найти человека" type="search" className="!py-2.5 pl-10" />
              </div>
            )}
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shown.map((p) => <PersonRow key={p.id} p={p} t0={t0} onOpen={() => setOpen(p.id)} />)}
            </ul>
            <p className="mt-3 text-center text-xs text-muted">{people.length} {plural(people.length, ['человек', 'человека', 'человек'])}</p>
          </div>
        </div>
      )}
      <PersonSheet open={open !== null} person={current} onClose={() => setOpen(null)} />
    </>
  );
}

function PersonRow({ p, t0, onOpen }: { p: Person; t0: string; onOpen: () => void }) {
  const b = nextBirthday(p, t0);
  const topics = p.topics.filter((t) => !t.done).length;
  const since = daysSinceContact(p, t0);
  return (
    <li>
      <button onClick={onOpen} className="glass focus-ring flex w-full items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.99]">
        <Avatar p={p} size={46} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{p.name}</span>
            {p.favorite && <Star size={13} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Избранный" />}
          </span>
          <span className="block truncate text-xs text-muted">
            {[p.relation, b ? `🎂 ${birthdayText(b.daysLeft)}` : null, since !== null ? `контакт ${fmtSince(since)}` : null].filter(Boolean).join(' · ') || 'Нажмите, чтобы добавить детали'}
          </span>
        </span>
        {topics > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-400/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-200" title="Что обсудить"><MessageCircle size={12} />{topics}</span>}
        {p.phone && <Phone size={15} className="shrink-0 text-muted" aria-hidden />}
      </button>
    </li>
  );
}
