// Разделы меню с учётом скрытых («Настройки → Разделы»). Настройка синхронизируется между устройствами.
// Скрытый раздел пропадает из боковой панели и «Ещё», но по ссылке и через поиск открывается — данные не трогаются.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { ALWAYS_VISIBLE, NAV } from './nav';

export function useHiddenSections(): string[] {
  return useLiveQuery(async () => {
    const v = (await db.settings.get('hiddenSections'))?.value;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !ALWAYS_VISIBLE.includes(x)) : [];
  }, []) ?? [];
}

export function useVisibleNav() {
  const hidden = useHiddenSections();
  return NAV.filter((n) => !hidden.includes(n.path));
}
