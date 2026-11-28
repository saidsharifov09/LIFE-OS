// «Входящие»: всё, что записано быстрым захватом. Разбор в один тап.
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m } from 'framer-motion';
import { Bookmark, CalendarDays, CheckSquare, Clock, Inbox, NotebookPen, Plus, Trash2, Wallet, X, TrendingUp } from 'lucide-react';
import { db } from '@/db/db';
import type { CaptureHints, InboxItem } from '@/db/types';
import { alive, deleteInbox, processInbox, runAction, type InboxTarget } from '@/actions';
import { patch } from '@/actions/core';
import { fmtRelative } from '@/lib/dates';
import { fmtMoney, plural } from '@/lib/format';
import { Button, Card, Chip, Empty, PageHeader } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { useCapture } from '@/modules/capture/CaptureSheet';

const LABELS: Record<InboxTarget, string> = {
  task: 'Задача создана', event: 'Событие создано', note: 'Заметка создана',
  expense: 'Расход записан', income: 'Доход записан', later: 'Добавлено в «Посмотреть позже»',
};

export default function InboxPage() {
  const items = useLiveQuery(async () => (await db.inbox.toArray()).filter((i) => alive(i) && !i.processed).sort((a, b) => b.createdAt - a.createdAt), []);
  const { open } = useCapture();

  return (
    <>
      <PageHeader
        title="Входящие"
        subtitle={items ? `${items.length} ${plural(items.length, ['запись', 'записи', 'записей'])} к разбору` : ' '}
        action={<Button variant="primary" size="icon" aria-label="Быстрая запись" onClick={() => open()}><Plus size={20} /></Button>}
      />
      {items && items.length === 0 && (
        <Card>
          <Empty icon={<Inbox size={26} />} title="Входящие пусты — голова свободна" hint="Нажмите «+», запишите мысль и нажмите Enter. Разберёте потом в один тап." />
        </Card>
      )}
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items?.map((it) => <InboxCard key={it.id} item={it} />)}
        </AnimatePresence>
      </ul>
    </>
  );
}

function InboxCard({ item }: { item: InboxItem }) {
  const toast = useToast();
  const h = item.hints ?? {};
  const go = async (target: InboxTarget) => {
    try {
      await processInbox(item.id, target);
      toast.show(`${LABELS[target]} ✓`, { undo: true });
    } catch (e) {
      toast.show((e as Error).message, { tone: 'error' });
    }
  };
  // Убрать неверную подсказку (ничего не применяем против вашей воли)
  const dropHint = (keys: (keyof CaptureHints)[]) =>
    runAction('Подсказка убрана', () => {
      const next = { ...h };
      keys.forEach((k) => delete next[k]);
      if (!next.date && !next.time && !next.amount) delete next.cleanText;
      return patch<InboxItem>('inbox', item.id, { hints: next });
    });

  return (
    <m.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}>
      <Card>
        <p className="whitespace-pre-wrap text-[16px] leading-snug">{item.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{new Date(item.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          {h.date && <HintChip icon={<CalendarDays size={13} />} onDrop={() => dropHint(['date'])}>{fmtRelative(h.date)}</HintChip>}
          {h.time && <HintChip icon={<Clock size={13} />} onDrop={() => dropHint(['time'])}>{h.time}</HintChip>}
          {h.amount && <HintChip icon={<Wallet size={13} />} onDrop={() => dropHint(['amount', 'currency', 'moneyKind'])}>{fmtMoney(h.amount, h.currency ?? 'RUB')}</HintChip>}
        </div>
        {h.cleanText && (h.date || h.time || h.amount) && <p className="mt-1.5 text-xs text-muted">Название: «{h.cleanText}»</p>}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <Button size="sm" variant="soft" icon={<CheckSquare size={16} />} onClick={() => go('task')}>Задача</Button>
          <Button size="sm" variant="soft" icon={<CalendarDays size={16} />} onClick={() => go('event')}>Событие</Button>
          <Button size="sm" variant="soft" icon={<NotebookPen size={16} />} onClick={() => go('note')}>Заметка</Button>
          {h.amount ? (
            h.moneyKind === 'income'
              ? <Button size="sm" variant="soft" icon={<TrendingUp size={16} />} onClick={() => go('income')}>Доход</Button>
              : <Button size="sm" variant="soft" icon={<Wallet size={16} />} onClick={() => go('expense')}>Расход</Button>
          ) : null}
          <Button size="sm" variant="soft" icon={<Bookmark size={16} />} onClick={() => go('later')}>Позже</Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={16} />} onClick={async () => { await deleteInbox(item.id); toast.show('Удалено', { undo: true }); }} aria-label="Удалить">
            <span className="sm:hidden">Удалить</span>
          </Button>
        </div>
      </Card>
    </m.li>
  );
}

function HintChip({ icon, children, onDrop }: { icon: React.ReactNode; children: React.ReactNode; onDrop: () => void }) {
  return (
    <Chip icon={icon} className="!pr-1">
      {children}
      <button onClick={onDrop} className="ml-0.5 grid h-6 w-6 place-items-center rounded-full hover:bg-[rgb(var(--line)/0.1)]" aria-label="Убрать подсказку"><X size={12} /></button>
    </Chip>
  );
}
