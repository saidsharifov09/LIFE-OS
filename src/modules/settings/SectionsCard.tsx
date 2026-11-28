// Настройки → Разделы: какие разделы показывать в меню (боковая панель и «Ещё»).
// Скрытие ничего не удаляет — раздел открывается по ссылке и через поиск.
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutGrid, NotebookPen } from 'lucide-react';
import { setSetting } from '@/actions';
import { HIDEABLE } from '@/app/nav';
import { useHiddenSections } from '@/app/useNav';
import { cx } from '@/lib/format';
import { Card, Switch } from '@/ui/primitives';

export function SectionsCard() {
  const hidden = useHiddenSections();
  const toggle = (path: string, show: boolean) => setSetting('hiddenSections', show ? hidden.filter((h) => h !== path) : [...hidden, path]);
  return (
    <Card title="Разделы" icon={<LayoutGrid size={18} />}>
      <p className="mb-3 text-sm text-muted">Уберите из меню то, чем не пользуетесь, — меньше отвлекает. Данные не удаляются, раздел можно вернуть в любой момент.</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        {HIDEABLE.map((n) => {
          const shown = !hidden.includes(n.path);
          return (
            <li key={n.path} className={cx('flex items-center gap-3 rounded-2xl bg-[rgb(var(--line)/0.05)] py-1.5 pl-3 pr-2', !shown && 'opacity-55')}>
              <n.icon size={18} className="shrink-0 text-accent-teal" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{n.label}</span>
              <Switch checked={shown} onChange={(v) => toggle(n.path, v)} label={`Показывать раздел «${n.label}»`} />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">«Мой день», «Входящие», «Задачи», «Календарь», «Поиск» и «Настройки» — всегда в меню.</p>
      <Link to="/notes?manage=1" className="focus-ring mt-3 flex items-center gap-3 rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 py-2.5 hover:bg-[rgb(var(--line)/0.09)]">
        <NotebookPen size={18} className="text-muted" />
        <span className="min-w-0 flex-1 font-medium">Разделы блокнота</span>
        <span className="hidden truncate text-sm text-muted sm:inline">создать, переименовать, порядок</span>
        <ChevronRight size={16} className="text-muted" />
      </Link>
    </Card>
  );
}
