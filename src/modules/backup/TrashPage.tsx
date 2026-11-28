// Корзина: удалённые записи хранятся 30 дней, потом удаляются автоматически.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { emptyTrash, listTrash, purgeItem, restoreFromTrash, TRASH_DAYS } from '@/actions';
import { plural } from '@/lib/format';
import { Button, Card, Empty, PageHeader } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';

export default function TrashPage() {
  const toast = useToast();
  const items = useLiveQuery(() => listTrash(), []);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <PageHeader
        title="Корзина"
        subtitle={<Link to="/settings" className="inline-flex items-center gap-1 hover:text-fg"><ArrowLeft size={14} />Настройки</Link>}
        action={items && items.length > 0 ? (
          confirm ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Нет</Button>
              <Button size="sm" variant="danger" onClick={async () => { const n = await emptyTrash(); setConfirm(false); toast.show(`Удалено навсегда: ${n}`, { undo: true }); }}>Да, очистить</Button>
            </div>
          ) : <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirm(true)}>Очистить</Button>
        ) : undefined}
      />
      <p className="mb-4 text-sm text-muted">Удалённое хранится {TRASH_DAYS} дней, затем исчезает само. Восстановить можно в одно касание.</p>
      <Card pad={false}>
        {!items ? <div className="h-24" /> : items.length === 0 ? (
          <Empty icon={<Trash2 size={26} />} title="Корзина пуста" hint="Сюда попадают удалённые задачи, события, операции и всё остальное." />
        ) : (
          <ul className="divide-y divide-[rgb(var(--line)/0.08)]">
            {items.map((it) => (
              <li key={it.table + it.id} className="flex items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{it.title || 'Без названия'}</p>
                  <p className="text-xs text-muted">
                    {it.kind} · удалено {new Date(it.deletedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    {' · '}<span className={it.daysLeft <= 3 ? 'text-amber-700 dark:text-amber-300' : ''}>осталось {it.daysLeft} {plural(it.daysLeft, ['день', 'дня', 'дней'])}</span>
                  </p>
                </div>
                <Button size="sm" variant="soft" icon={<RotateCcw size={15} />} onClick={async () => { await restoreFromTrash(it.table, it.id); toast.show('Восстановлено ✓', { undo: true }); }}>Вернуть</Button>
                <Button size="icon" variant="ghost" className="!h-9 !w-9 text-muted" aria-label={`Удалить навсегда: ${it.title}`} onClick={async () => { await purgeItem(it.table, it.id); toast.show('Удалено навсегда', { undo: true }); }}><Trash2 size={16} /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
