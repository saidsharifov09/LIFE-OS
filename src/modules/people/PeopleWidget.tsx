// Виджет главной «Люди»: дни рождения на ближайшую неделю и кому пора написать. Пусто — виджет не показывается.
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cake, Users } from 'lucide-react';
import { markContact, peopleToContact, upcomingBirthdays } from '@/actions';
import { fmtSince } from '@/lib/people';
import { cx } from '@/lib/format';
import { Button, Card } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { Avatar, birthdayText } from './shared';

export function PeopleWidget() {
  const toast = useToast();
  const data = useLiveQuery(async () => ({ bdays: await upcomingBirthdays(7), due: (await peopleToContact()).slice(0, 3) }), []);
  if (!data || (!data.bdays.length && !data.due.length)) return null;
  return (
    <Card title="Люди" icon={<Users size={18} />} action={<Link to="/people" className="text-sm text-sky-600 dark:text-sky-300">Все</Link>}>
      <ul className="space-y-1">
        {data.bdays.map(({ person: p, next }) => (
          <li key={p.id} className={cx('flex items-center gap-3 rounded-2xl p-2', next.daysLeft === 0 && 'bg-pink-400/12')}>
            <Avatar p={p} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="flex items-center gap-1 text-xs text-muted"><Cake size={12} /> День рождения{next.age !== null ? ` · ${next.age}` : ''}</span>
            </span>
            <span className={cx('shrink-0 text-sm font-semibold', next.daysLeft === 0 ? 'text-pink-600 dark:text-pink-300' : 'text-amber-600 dark:text-amber-300')}>{birthdayText(next.daysLeft)}</span>
          </li>
        ))}
        {data.due.map(({ person: p, since }) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl p-2">
            <Avatar p={p} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block text-xs text-muted">Пора написать · контакт {fmtSince(since)}</span>
            </span>
            <Button size="sm" variant="soft" onClick={async () => { await markContact(p.id); toast.show(`Отмечено: общались с ${p.name}`, { undo: true }); }}>✓</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
