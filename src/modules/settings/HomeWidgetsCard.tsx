// Настройки → Главная: порядок (стрелки ↑↓) и видимость (переключатель) виджетов «Мой день».
// Хранится в настройках и синхронизируется: на iPhone и ноутбуке главная одинаковая.
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, LayoutDashboard, RotateCcw } from 'lucide-react';
import { getSetting, setSetting } from '@/actions';
import { moveWidget, WIDGET_INFO, widgetOrder, isWidgetId, type WidgetId } from '@/lib/widgets';
import { cx } from '@/lib/format';
import { Button, Card, Switch } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';

export function HomeWidgetsCard() {
  const toast = useToast();
  const state = useLiveQuery(async () => ({
    order: widgetOrder(await getSetting<unknown>('homeWidgets', null)),
    hidden: ((await getSetting<unknown[]>('homeHidden', [])) ?? []).filter(isWidgetId),
  }), []);
  if (!state) return <Card title="Главная" icon={<LayoutDashboard size={18} />}><div className="h-40" /></Card>;
  const { order, hidden } = state;

  const move = (id: WidgetId, dir: -1 | 1) => setSetting('homeWidgets', moveWidget(order, id, dir));
  const toggle = (id: WidgetId, show: boolean) => setSetting('homeHidden', show ? hidden.filter((h) => h !== id) : [...hidden, id]);
  const reset = async () => {
    const prev = { order, hidden };
    await setSetting('homeWidgets', null);
    await setSetting('homeHidden', []);
    toast.show('Главная — как по умолчанию', { action: { label: 'Вернуть', onClick: async () => { await setSetting('homeWidgets', prev.order); await setSetting('homeHidden', prev.hidden); } } });
  };

  return (
    <Card title="Главная «Мой день»" icon={<LayoutDashboard size={18} />}
      action={<Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>Сбросить</Button>}>
      <p className="mb-3 text-sm text-muted">Какие виджеты показывать и в каком порядке. Одинаково на всех устройствах.</p>
      <ol className="space-y-1.5" aria-label="Виджеты главной">
        {order.map((id, i) => {
          const shown = !hidden.includes(id);
          return (
            <li key={id} className={cx('flex items-center gap-2 rounded-2xl bg-[rgb(var(--line)/0.05)] py-1.5 pl-3 pr-1.5', !shown && 'opacity-55')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{WIDGET_INFO[id].name}</span>
                <span className="block truncate text-xs text-muted">{WIDGET_INFO[id].hint}</span>
              </span>
              <Switch checked={shown} onChange={(v) => toggle(id, v)} label={`Показывать «${WIDGET_INFO[id].name}»`} />
              <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`«${WIDGET_INFO[id].name}» выше`}
                className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-[rgb(var(--line)/0.08)] hover:text-fg disabled:opacity-25"><ArrowUp size={17} /></button>
              <button type="button" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label={`«${WIDGET_INFO[id].name}» ниже`}
                className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-[rgb(var(--line)/0.08)] hover:text-fg disabled:opacity-25"><ArrowDown size={17} /></button>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">Некоторые виджеты сами прячутся, когда показать нечего (обзор дня после прохождения, «Люди» без дней рождения).</p>
    </Card>
  );
}
