// Настройки: облако, копии, главная, разделы, валюты, PIN, оформление, напоминания, демо, данные.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, ChevronRight, Database, Monitor, Moon, Palette, Sparkles, Sun, Trash2 } from 'lucide-react';
import { db, DATA_TABLES } from '@/db/db';
import { useTheme, type ThemeMode } from '@/app/theme';
import { Button, Card, Chip, PageHeader, Segmented, Switch } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { clearDemo, hasDemo, seedDemo } from './demo';
import { BackupCard } from '@/modules/backup/BackupCard';
import { SyncCard } from '@/modules/sync/SyncCard';
import { listTrash } from '@/actions';
import { HomeWidgetsCard } from './HomeWidgetsCard';
import { SectionsCard } from './SectionsCard';
import { RatesCard } from '@/modules/finance/RatesCard';
import { PinCard } from '@/modules/pin/PinCard';

/** Быстрые переходы по длинной странице настроек; id — якоря (#home ведёт сюда с главной) */
const JUMPS = [
  { id: 'sync', label: 'Облако' }, { id: 'backup', label: 'Копии' }, { id: 'home', label: 'Главная' },
  { id: 'sections', label: 'Разделы' }, { id: 'money', label: 'Валюты' }, { id: 'pin', label: 'PIN-код' },
  { id: 'look', label: 'Оформление' }, { id: 'data', label: 'Данные' },
];

export default function SettingsPage() {
  const theme = useTheme();
  const toast = useToast();
  const demo = useLiveQuery(hasDemo, [], false);
  const [busy, setBusy] = useState(false);
  const trash = useLiveQuery(async () => (await listTrash()).length, [], 0);
  const { hash } = useLocation();
  // Переход с баннера «Пора сделать копию» — прокрутить к карточке
  useEffect(() => {
    const id = hash.slice(1);
    if (!JUMPS.some((j) => j.id === id)) return;
    // Второй раз — когда карточки выше (облако, копии) догрузятся и сдвинут страницу
    const go = (behavior: ScrollBehavior) => document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
    const t1 = setTimeout(() => go('smooth'), 80);
    const t2 = setTimeout(() => go('auto'), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hash]);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  return (
    <>
      <PageHeader title="Настройки" />
      <nav aria-label="Разделы настроек" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {JUMPS.map((j) => (
          <Chip key={j.id} onClick={() => document.getElementById(j.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{j.label}</Chip>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div id="sync" className="scroll-mt-4 lg:col-span-2"><SyncCard /></div>
        <div id="backup" className="scroll-mt-4 lg:col-span-2"><BackupCard /></div>
        <div id="home" className="scroll-mt-4 lg:row-span-2"><HomeWidgetsCard /></div>
        <div id="sections" className="scroll-mt-4"><SectionsCard /></div>
        <div id="money" className="scroll-mt-4">
          <RatesCard />
          <Link to="/finance?tab=settings" className="mt-2 flex items-center justify-end gap-1 px-2 text-sm text-muted hover:text-fg">Счёт по умолчанию, CSV, архив счетов <ChevronRight size={14} /></Link>
        </div>
        <div id="pin" className="scroll-mt-4"><PinCard /></div>

        <Card id="look" className="scroll-mt-4" title="Оформление" icon={<Palette size={18} />}>
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
          <Link to="/design" className="mt-4 inline-block text-sm text-sky-700 dark:text-sky-300">Открыть витрину дизайн-системы →</Link>
        </Card>

        <Card title="Напоминания" icon={<Bell size={18} />}>
          <p className="text-sm text-muted">
            Напоминания работают, пока приложение открыто. Без сервера iPhone не покажет уведомление при закрытом приложении —
            для важного нажмите «В Календарь iPhone» в задаче, событии или платеже: календарь напомнит сам.
          </p>
          {perm !== 'unsupported' && perm !== 'granted' && (
            <Button className="mt-3" size="sm" variant="soft" onClick={async () => setPerm(await Notification.requestPermission())}>Разрешить системные уведомления</Button>
          )}
          {perm === 'granted' && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">Системные уведомления разрешены ✓</p>}
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

        <Card id="data" className="scroll-mt-4" title="Данные" icon={<Database size={18} />}>
          <p className="text-sm text-muted">Всё хранится на этом устройстве (IndexedDB) и работает без интернета. Облако — по желанию, в карточке выше.</p>
          <Link to="/trash" className="focus-ring mt-3 flex items-center gap-3 rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 py-2.5 hover:bg-[rgb(var(--line)/0.09)]">
            <Trash2 size={18} className="text-muted" />
            <span className="flex-1 font-medium">Корзина</span>
            <span className="text-sm text-muted">{trash ? trash : 'пусто'}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
          <Button className="mt-3" variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={async () => {
            if (!confirm('Удалить ВСЕ данные на этом устройстве (минуя корзину)? Если включена синхронизация, они удалятся и в облаке, и на других устройствах. Сначала сохраните резервную копию. Это нельзя отменить.')) return;
            for (const t of DATA_TABLES) await db.table(t).clear();
            toast.show('Все данные удалены');
          }}>Удалить все данные</Button>
        </Card>
      </div>
      <p className="mt-6 text-center text-xs text-muted">Life OS · версия {__APP_VERSION__}</p>
    </>
  );
}
