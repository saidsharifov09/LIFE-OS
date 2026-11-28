// Список разделов приложения: маршрут, название, иконка, этап готовности.
import {
  Home, Inbox, CheckSquare, CalendarDays, Wallet, Target, HeartPulse, NotebookPen,
  Bookmark, Users, History, Search, Settings, Palette, Sunrise, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Номер этапа ROADMAP, на котором раздел будет готов */
  stage: number;
  /** Показывать в боковой панели */
  sidebar?: boolean;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Мой день', icon: Home, stage: 1, sidebar: true },
  { path: '/inbox', label: 'Входящие', icon: Inbox, stage: 1, sidebar: true },
  { path: '/tasks', label: 'Задачи', icon: CheckSquare, stage: 1, sidebar: true },
  { path: '/calendar', label: 'Календарь', icon: CalendarDays, stage: 2, sidebar: true },
  { path: '/review', label: 'Обзор дня', icon: Sunrise, stage: 2, sidebar: true },
  { path: '/finance', label: 'Финансы', icon: Wallet, stage: 3, sidebar: true },
  { path: '/goals', label: 'Цели и привычки', icon: Target, stage: 5, sidebar: true },
  { path: '/health', label: 'Здоровье', icon: HeartPulse, stage: 5, sidebar: true },
  { path: '/notes', label: 'Блокнот', icon: NotebookPen, stage: 6, sidebar: true },
  { path: '/later', label: 'Посмотреть позже', icon: Bookmark, stage: 6, sidebar: true },
  { path: '/people', label: 'Люди', icon: Users, stage: 6, sidebar: true },
  { path: '/log', label: 'История', icon: History, stage: 6, sidebar: true },
  { path: '/search', label: 'Поиск', icon: Search, stage: 7, sidebar: true },
  { path: '/settings', label: 'Настройки', icon: Settings, stage: 7, sidebar: true },
  { path: '/design', label: 'Дизайн-система', icon: Palette, stage: 0 },
];

/** Нижняя панель на iPhone: 4 вкладки + кнопка захвата по центру */
export const BOTTOM_TABS = ['/', '/tasks', '/calendar', '/more'];

/** Эти разделы нельзя скрыть: основа приложения и нижняя панель iPhone */
export const ALWAYS_VISIBLE = ['/', '/inbox', '/tasks', '/calendar', '/search', '/settings'];
/** Разделы, которые можно убрать из меню в «Настройки → Разделы» */
export const HIDEABLE = NAV.filter((n) => n.sidebar && !ALWAYS_VISIBLE.includes(n.path));
