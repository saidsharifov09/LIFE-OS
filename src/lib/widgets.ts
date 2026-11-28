// Виджеты главной «Мой день»: список, названия, порядок и видимость.
// Порядок (`homeWidgets`) и скрытые (`homeHidden`) хранятся в настройках и синхронизируются между устройствами.

export const DEFAULT_WIDGETS = ['review', 'progress', 'top', 'tasks', 'habits', 'health', 'schedule', 'next', 'money', 'people', 'inbox', 'quote'] as const;
export type WidgetId = (typeof DEFAULT_WIDGETS)[number];

export const WIDGET_INFO: Record<WidgetId, { name: string; hint: string }> = {
  review: { name: 'Обзор дня', hint: 'Утром — утренний обзор, вечером — отчёт' },
  progress: { name: 'Прогресс дня', hint: 'Кольцо выполненных задач' },
  top: { name: '3 главных дела', hint: 'Приоритеты дня' },
  tasks: { name: 'Задачи на сегодня', hint: 'И просроченные' },
  habits: { name: 'Привычки', hint: 'Отметка в одно касание' },
  health: { name: 'Вода, сон, настроение', hint: 'Быстрый ввод за сегодня' },
  schedule: { name: 'Расписание', hint: 'События и задачи по времени' },
  next: { name: 'Ближайшее', hint: 'Что дальше и через сколько' },
  money: { name: 'Деньги', hint: 'Остаток, траты, бюджет' },
  people: { name: 'Люди', hint: 'Дни рождения и «давно не общались»' },
  inbox: { name: 'Входящие', hint: 'Сколько ждёт разбора' },
  quote: { name: 'Цитата дня', hint: 'Немного мотивации' },
};

export const isWidgetId = (x: unknown): x is WidgetId => typeof x === 'string' && (DEFAULT_WIDGETS as readonly string[]).includes(x);

/**
 * Итоговый порядок: сохранённый (без неизвестных и дублей) + новые виджеты из обновлений — в конец.
 */
export function widgetOrder(saved: unknown): WidgetId[] {
  const list = Array.isArray(saved) ? saved.filter(isWidgetId) : [];
  const uniq = [...new Set(list)];
  return [...uniq, ...DEFAULT_WIDGETS.filter((w) => !uniq.includes(w))];
}

/** Видимые виджеты в нужном порядке */
export function visibleWidgets(saved: unknown, hidden: unknown): WidgetId[] {
  const h = new Set(Array.isArray(hidden) ? hidden.filter(isWidgetId) : []);
  return widgetOrder(saved).filter((w) => !h.has(w));
}

/** Сдвинуть виджет на одну позицию вверх (-1) или вниз (+1) */
export function moveWidget(order: WidgetId[], id: WidgetId, dir: -1 | 1): WidgetId[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
