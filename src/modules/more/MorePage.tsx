// «Ещё» — меню всех разделов на iPhone
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { NAV } from '@/app/nav';
import { db } from '@/db/db';
import { PageHeader } from '@/ui/primitives';

export default function MorePage() {
  const inbox = useLiveQuery(async () => (await db.inbox.toArray()).filter((i) => !i.deletedAt && !i.processed).length, [], 0);
  const items = NAV.filter((n) => !['/', '/tasks', '/calendar'].includes(n.path));
  return (
    <>
      <PageHeader title="Разделы" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((n) => (
          <Link key={n.path} to={n.path} className="glass focus-ring relative flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl p-2 text-center transition active:scale-95">
            <n.icon size={26} className="text-accent-teal" />
            <span className="text-[12px] font-medium leading-tight">{n.label}</span>
            {n.path === '/inbox' && !!inbox && <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-sky-400 px-1.5 text-[11px] font-bold text-slate-950">{inbox}</span>}
          </Link>
        ))}
      </div>
    </>
  );
}
