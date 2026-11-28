// «С чего начать» — на главной, пока в приложении нет ни одной записи (первый запуск).
// Три простых первых шага вместо пустого экрана. Исчезает сама, как только появились данные, или по «Скрыть».
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ListTodo, PenLine, Sparkles, X } from 'lucide-react';
import { db, DATA_TABLES } from '@/db/db';
import { getSetting, setSetting } from '@/actions';
import { useCapture } from '@/modules/capture/CaptureSheet';
import { Button, Card } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';

export function WelcomeCard({ onAddTask }: { onAddTask: () => void }) {
  const { open } = useCapture();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const show = useLiveQuery(async () => {
    if (await getSetting<boolean>('welcomeDismissed', false)) return false;
    // Стартовые разделы блокнота создаются сами — их не считаем
    for (const t of DATA_TABLES) if (t !== 'noteSections' && (await db.table(t).count()) > 0) return false;
    return true;
  }, [], false);
  if (!show) return null;

  return (
    <Card className="md:col-span-2 xl:col-span-3 !bg-gradient-to-br from-sky-500/15 via-teal-500/10 to-emerald-500/15"
      title="С чего начать" icon={<Sparkles size={18} />}
      action={<button onClick={() => setSetting('welcomeDismissed', true)} aria-label="Скрыть подсказку" className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted hover:text-fg"><X size={16} /></button>}>
      <p className="mb-3 text-sm text-muted">Life OS — одно место для дел, времени, денег и заметок. Начните с одного шага — остальное подтянется.</p>
      <ol className="grid gap-2 sm:grid-cols-3">
        <Step n={1} icon={<PenLine size={18} />} title="Запишите мысль" hint="Кнопка «+» — 3 секунды, разберёте потом" onClick={() => open()} />
        <Step n={2} icon={<ListTodo size={18} />} title="Одна задача на сегодня" hint="Маленькая и выполнимая" onClick={onAddTask} />
        <Step n={3} icon={<Sparkles size={18} />} title="Посмотреть на примере" hint="Демо-данные, удаляются одной кнопкой" disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { seedDemo } = await import('@/modules/settings/demo');
            await seedDemo();
            setBusy(false);
            toast.show('Демо-данные добавлены. Удалить — в «Настройках»');
          }} />
      </ol>
    </Card>
  );
}

function Step({ n, icon, title, hint, onClick, disabled }: { n: number; icon: ReactNode; title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <li>
      <Button variant="glass" className="!h-auto w-full !justify-start gap-3 !rounded-2xl !px-3 !py-3 text-left" onClick={onClick} disabled={disabled}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--line)/0.08)] text-accent-teal" aria-hidden="true">{icon}</span>
        <span className="min-w-0 whitespace-normal">
          <span className="block text-[15px] font-semibold">{n}. {title}</span>
          <span className="block text-xs font-normal text-muted">{hint}</span>
        </span>
      </Button>
    </li>
  );
}
