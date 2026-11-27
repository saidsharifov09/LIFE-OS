// Напоминание раз в неделю сделать резервную копию (на главной).
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldAlert } from 'lucide-react';
import { backupDue, snoozeBackup } from '@/actions';
import { Button, Card } from '@/ui/primitives';

export function BackupBanner() {
  const state = useLiveQuery(() => backupDue(), []);
  const nav = useNavigate();
  if (!state?.due) return null;
  const days = state.lastAt ? Math.floor((Date.now() - state.lastAt) / 86400000) : null;
  return (
    <Card className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-600 dark:text-amber-300"><ShieldAlert size={22} /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Пора сделать резервную копию</p>
        <p className="text-sm text-muted">{days !== null ? `Последняя — ${days} дн. назад.` : 'Копий ещё не было.'} 10 секунд — и данные в безопасности.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => snoozeBackup()}>Позже</Button>
        <Button size="sm" variant="primary" onClick={() => nav('/settings#backup')}>Сделать копию</Button>
      </div>
    </Card>
  );
}
