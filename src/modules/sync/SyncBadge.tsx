// Индикатор «Синхронизировано / нет сети». Не показывается, если облако не подключено.
import { Link } from 'react-router-dom';
import { Cloud, CloudAlert, CloudCheck, CloudOff, KeyRound, RefreshCw } from 'lucide-react';
import { useSyncState, type SyncStatus } from '@/sync/auto';
import { cx } from '@/lib/format';

const VIEW: Record<Exclude<SyncStatus, 'off'>, { label: string; icon: typeof Cloud; cls: string }> = {
  synced: { label: 'Синхронизировано', icon: CloudCheck, cls: 'text-emerald-600 dark:text-emerald-300' },
  syncing: { label: 'Синхронизация…', icon: RefreshCw, cls: 'text-sky-600 dark:text-sky-300' },
  offline: { label: 'Нет сети', icon: CloudOff, cls: 'text-muted' },
  error: { label: 'Ошибка синхронизации', icon: CloudAlert, cls: 'text-red-600 dark:text-red-300' },
  locked: { label: 'Нужен пароль', icon: KeyRound, cls: 'text-amber-600 dark:text-amber-300' },
};

export function SyncBadge({ link, className }: { link?: boolean; className?: string }) {
  const st = useSyncState();
  if (st.status === 'off') return null;
  const v = VIEW[st.status];
  const body = (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--line)/0.06)] px-2.5 py-1 text-xs font-medium', v.cls, !link && className)} title={st.error ?? v.label} role="status">
      <v.icon size={14} className={st.status === 'syncing' ? 'animate-spin' : ''} />
      {v.label}
    </span>
  );
  return link ? <Link to="/settings#sync" className={cx('focus-ring self-start rounded-full', className)}>{body}</Link> : body;
}
