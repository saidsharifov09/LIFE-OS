// Настройки (базовые). Полный набор — Этап 7.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, ChevronRight, Database, Monitor, Moon, Palette, Sparkles, Sun, Trash2 } from 'lucide-react';
import { db, DATA_TABLES } from '@/db/db';
import { useTheme, type ThemeMode } from '@/app/theme';
import { Button, Card, PageHeader, Segmented, Switch } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { clearDemo, hasDemo, seedDemo } from './demo';
import { BackupCard } from '@/modules/backup/BackupCard';
import { listTrash } from '@/actions';

export default function SettingsPage() {
  const theme = useTheme();
  const toast = useToast();
  const demo = useLiveQuery(hasDemo, [], false);
  const [busy, setBusy] = useState(false);
  const trash = useLiveQuery(async () => (await listTrash()).length, [], 0);
  const { hash } = useLocation();
  // Переход с баннера «Пора сделать копию» — прокрутить к карточке
  useEffect(() => {
    if (hash === '#backup') setTimeout(() => document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [hash]);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  return (
    <>
      <PageHeader title="Настройки" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div id="backup" className="scroll-mt-4 lg:col-span-2"><BackupCard /></div>

        <Card title="Оформление" icon={<Palette size={18} />}>
          <Segmented<ThemeMode>
            value={theme.mode}
            onChange={theme.setMode}
            options={[
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={15} />Тёмная</span> },
              { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={15} />Светлая</span> },
              { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={15} />Как в системе</span> },
            ]}
          />
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium">Упростить размытие</p>
              <p className="text-sm text-muted">Быстрее на слабом ноутбуке; карточки станут плотнее.</p>
            </div>
            <Switch checked={theme.lowBlur} onChange={theme.setLowBlur} label="Упростить размытие" />
          </div>
          <Link to="/design" className="mt-4 inline-block text-sm text-sky-600 dark:text-sky-300">Открыть витрину дизайн-системы →</Link>
        </Card>

        <Card title="Напоминания" icon={<Bell size={18} />}>
          <p className="text-sm text-muted">
            Напоминания работают, пока приложение открыто. Без сервера iPhone не покажет уведомление при закрытом приложении —
            для важного нажмите «В Календарь iPhone» в задаче, событии или платеже: календарь напомнит сам.
          </p>
          {perm !== 'unsupported' && perm !== 'granted' && (
            <Button className="mt-3" size="sm" variant="soft" onClick={async () => setPerm(await Notification.requestPermission())}>Разрешить системные уведомления</Button>
          )}
          {perm === 'granted' && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">Системные уведомления разрешены ✓</p>}
        </Card>

        <Card title="Демо-данные" icon={<Sparkles size={18} />}>
          <p className="text-sm text-muted">Пример задач, событий и расходов, чтобы посмотреть, как всё выглядит. Удаляются одной кнопкой, ваши записи не трогаются.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!demo ? (
              <Button variant="primary" size="sm" disabled={busy} onClick={async () => { setBusy(true); await seedDemo(); setBusy(false); toast.show('Демо-данные добавлены'); }}>Добавить демо-данные</Button>
            ) : (
              <Button variant="danger" size="sm" disabled={busy} onClick={async () => { setBusy(true); const n = await clearDemo(); setBusy(false); toast.show(`Удалено демо-записей: ${n}`); }}>Удалить демо-данные</Button>
            )}
          </div>
        </Card>

        <Card title="Данные" icon={<Database size={18} />}>
          <p className="text-sm text-muted">Всё хранится на этом устройстве (IndexedDB) и работает без интернета. Облачная синхронизация — Этап 4.5.</p>
          <Link to="/trash" className="focus-ring mt-3 flex items-center gap-3 rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 py-2.5 hover:bg-[rgb(var(--line)/0.09)]">
            <Trash2 size={18} className="text-muted" />
            <span className="flex-1 font-medium">Корзина</span>
            <span className="text-sm text-muted">{trash ? trash : 'пусто'}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
          <Button className="mt-3" variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={async () => {
            if (!confirm('Удалить ВСЕ данные на этом устройстве (минуя корзину)? Сначала сохраните резервную копию. Это нельзя отменить.')) return;
            for (const t of DATA_TABLES) await db.table(t).clear();
            toast.show('Все данные удалены');
          }}>Удалить все данные</Button>
        </Card>
      </div>
      <p className="mt-6 text-center text-xs text-muted">Life OS · версия {__APP_VERSION__}</p>
    </>
  );
}
