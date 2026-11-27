// Иконки категорий по имени (имена задаются в src/lib/categories.ts).
// Явный список — чтобы в бандл попадали только нужные иконки.
import {
  BadgeDollarSign, Banknote, Briefcase, Bus, CircleDot, Coffee, CreditCard, Gamepad2, Gift, GraduationCap, Hammer,
  HeartPulse, Home, Landmark, PiggyBank, Repeat, Shirt, ShoppingBasket, Smartphone, User, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Account } from '@/db/types';
import { findCategory } from '@/lib/categories';

const ICONS: Record<string, LucideIcon> = {
  BadgeDollarSign, Banknote, Briefcase, Bus, CircleDot, Coffee, CreditCard, Gamepad2, Gift, GraduationCap, Hammer,
  HeartPulse, Home, Landmark, PiggyBank, Repeat, Shirt, ShoppingBasket, Smartphone, User, Wallet,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? CircleDot;
  return <C size={size} className={className} />;
}

/** Кружок с иконкой категории в её цвете */
export function CategoryBadge({ id, kind = 'expense', size = 40 }: { id?: string | null; kind?: 'expense' | 'income'; size?: number }) {
  const c = findCategory(id, kind) ?? findCategory(kind === 'income' ? 'other-in' : 'other', kind);
  return (
    <span className="grid shrink-0 place-items-center rounded-2xl" style={{ width: size, height: size, background: `${c?.color ?? '#94a3b8'}26`, color: c?.color }}>
      <Icon name={c?.icon ?? 'CircleDot'} size={Math.round(size * 0.48)} />
    </span>
  );
}

export const ACCOUNT_KINDS: { id: Account['kind']; name: string; icon: string }[] = [
  { id: 'card', name: 'Карта', icon: 'CreditCard' },
  { id: 'cash', name: 'Наличные', icon: 'Banknote' },
  { id: 'savings', name: 'Накопительный', icon: 'PiggyBank' },
  { id: 'other', name: 'Другое', icon: 'Landmark' },
];

export function AccountIcon({ kind, color, size = 40 }: { kind: Account['kind']; color?: string; size?: number }) {
  const k = ACCOUNT_KINDS.find((x) => x.id === kind) ?? ACCOUNT_KINDS[3];
  const col = color ?? '#38bdf8';
  return (
    <span className="grid shrink-0 place-items-center rounded-2xl" style={{ width: size, height: size, background: `${col}26`, color: col }}>
      <Icon name={k.icon} size={Math.round(size * 0.48)} />
    </span>
  );
}
