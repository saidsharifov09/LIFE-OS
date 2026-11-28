// Справочники категорий. Иконки — имена из lucide-react (см. src/ui/Icon.tsx).

export interface CategoryDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Ключевые слова для ПОДСКАЗКИ категории по тексту */
  keywords?: RegExp;
}

/** Категории задач (цвет метки) */
export const TASK_CATEGORIES: CategoryDef[] = [
  { id: 'personal', name: 'Личное', icon: 'User', color: '#38bdf8' },
  { id: 'work', name: 'Работа', icon: 'Briefcase', color: '#a78bfa' },
  { id: 'home', name: 'Дом', icon: 'Home', color: '#2dd4bf' },
  { id: 'health', name: 'Здоровье', icon: 'HeartPulse', color: '#34d399' },
  { id: 'study', name: 'Учёба', icon: 'GraduationCap', color: '#fbbf24' },
  { id: 'money', name: 'Финансы', icon: 'Wallet', color: '#f472b6' },
];

export const EXPENSE_CATEGORIES: CategoryDef[] = [
  { id: 'food', name: 'Продукты', icon: 'ShoppingBasket', color: '#34d399', keywords: /(продукт|магазин|супермаркет|пятёрочк|пятерочк|магнит|овощ|фрукт|хлеб|молоко)/i },
  { id: 'cafe', name: 'Кафе', icon: 'Coffee', color: '#fbbf24', keywords: /(кофе|кафе|ресторан|обед|ужин|завтрак|доставк|пицц|шаурм|бургер|чай)/i },
  { id: 'transport', name: 'Транспорт', icon: 'Bus', color: '#38bdf8', keywords: /(такси|метро|автобус|бензин|топливо|парковк|проезд|поезд|самол[её]т|билет)/i },
  { id: 'home', name: 'Дом', icon: 'Home', color: '#2dd4bf', keywords: /(аренд|квартир|коммунал|свет|газ|вода за|ремонт|мебел)/i },
  { id: 'phone', name: 'Связь', icon: 'Smartphone', color: '#818cf8', keywords: /(связь|телефон|интернет|мобильн)/i },
  { id: 'health', name: 'Здоровье', icon: 'HeartPulse', color: '#f87171', keywords: /(аптек|лекарств|врач|анализ|стоматолог|клиник)/i },
  { id: 'clothes', name: 'Одежда', icon: 'Shirt', color: '#f472b6', keywords: /(одежд|обувь|кроссовк|куртк|футболк)/i },
  { id: 'fun', name: 'Развлечения', icon: 'Gamepad2', color: '#c084fc', keywords: /(кино|игр|концерт|развлеч|бар)/i },
  { id: 'gifts', name: 'Подарки', icon: 'Gift', color: '#fb7185', keywords: /(подар)/i },
  { id: 'subs', name: 'Подписки', icon: 'Repeat', color: '#22d3ee', keywords: /(подписк|netflix|spotify|youtube|яндекс плюс|icloud)/i },
  { id: 'edu', name: 'Образование', icon: 'GraduationCap', color: '#facc15', keywords: /(курс|книг|учёб|учеб|репетитор)/i },
  { id: 'other', name: 'Другое', icon: 'CircleDot', color: '#94a3b8' },
];

export const INCOME_CATEGORIES: CategoryDef[] = [
  { id: 'salary', name: 'Зарплата', icon: 'BadgeDollarSign', color: '#34d399', keywords: /(зарплат|аванс|оклад)/i },
  { id: 'side', name: 'Подработка', icon: 'Hammer', color: '#2dd4bf', keywords: /(подработ|фриланс|заказ)/i },
  { id: 'gift', name: 'Подарок', icon: 'Gift', color: '#fb7185', keywords: /(подар)/i },
  { id: 'other-in', name: 'Другое', icon: 'CircleDot', color: '#94a3b8' },
];

/** Подсказать категорию по тексту (пользователь может поменять) */
export function guessCategory(text: string, kind: 'expense' | 'income'): string {
  const list = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (list.find((c) => c.keywords?.test(text)) ?? list[list.length - 1]).id;
}

export function findCategory(id: string | null | undefined, kind: 'expense' | 'income' | 'task' = 'expense'): CategoryDef | undefined {
  const list = kind === 'task' ? TASK_CATEGORIES : kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find((c) => c.id === id);
}

/** Палитра цветов для событий и меток */
export const PALETTE = ['#38bdf8', '#2dd4bf', '#34d399', '#a78bfa', '#f472b6', '#fbbf24', '#fb923c', '#94a3b8'];

/** Стартовые разделы блокнота (с эмодзи) */
export const DEFAULT_NOTE_SECTIONS: { name: string; icon: string }[] = [
  { name: 'Для себя', icon: '🙂' }, { name: 'Идеи', icon: '💡' }, { name: 'Куда сходить', icon: '📍' },
  { name: 'Кому рассказать', icon: '💬' }, { name: 'Что купить', icon: '🛒' }, { name: 'Фильмы и сериалы', icon: '🎬' },
  { name: 'Книги', icon: '📚' }, { name: 'Интересные факты', icon: '🧠' }, { name: 'Важное', icon: '⭐' },
  { name: 'Мои проекты', icon: '🚀' }, { name: 'Разное', icon: '📝' },
];
