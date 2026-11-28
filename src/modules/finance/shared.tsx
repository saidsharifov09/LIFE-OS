// Общие элементы раздела «Финансы»: данные, выбор счёта/категории/валюты, суммы.
import { useLiveQuery } from 'dexie-react-hooks';
import type { Account, Currency } from '@/db/types';
import { financeData } from '@/actions';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/categories';
import { CURRENCIES } from '@/lib/finance';
import { CURRENCY_SIGN, cx, fmtMoney } from '@/lib/format';
import { Chip } from '@/ui/primitives';
import { AccountIcon, Icon } from '@/ui/CategoryIcon';

export type FinanceData = Awaited<ReturnType<typeof financeData>>;

/** Живые данные финансов (перечитываются при любом изменении) */
export function useFinance(): FinanceData | undefined {
  return useLiveQuery(() => financeData(), []);
}

/** Сумма со знаком: расход «−», доход «+» (цвет только у дохода; красный — только для превышений) */
export function Amount({ value, currency = 'RUB', type, className }: { value: number; currency?: Currency; type?: 'expense' | 'income' | 'transfer'; className?: string }) {
  const sign = type === 'expense' ? '−' : type === 'income' ? '+' : '';
  return (
    <span className={cx('whitespace-nowrap font-semibold tabular-nums', type === 'income' && 'text-emerald-700 dark:text-emerald-300', className)}>
      {sign}{fmtMoney(Math.abs(value), currency)}
    </span>
  );
}

export function CurrencyPicker({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Валюта">
      {CURRENCIES.map((c) => (
        <Chip key={c} active={value === c} onClick={() => onChange(c)}>{CURRENCY_SIGN[c]}</Chip>
      ))}
    </div>
  );
}

export function AccountPicker({ accounts, value, onChange, allowNone, exclude }: {
  accounts: Account[]; value: string | null | undefined; onChange: (id: string | null) => void; allowNone?: boolean; exclude?: string | null;
}) {
  const list = accounts.filter((a) => a.id !== exclude);
  if (!list.length && !allowNone) return <p className="text-sm text-muted">Счетов пока нет — добавьте на вкладке «Обзор».</p>;
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {allowNone && <Chip active={!value} onClick={() => onChange(null)}>Без счёта</Chip>}
      {list.map((a) => (
        <Chip key={a.id} active={value === a.id} onClick={() => onChange(a.id)}>
          <AccountIcon kind={a.kind} color={a.color} size={18} />{a.name}
        </Chip>
      ))}
    </div>
  );
}

/** Сетка категорий: крупные кнопки с иконками */
export function CategoryGrid({ kind, value, onPick, compact }: { kind: 'expense' | 'income'; value?: string | null; onPick: (id: string) => void; compact?: boolean }) {
  const list = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <div className={cx('grid gap-2', compact ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-4')}>
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          aria-pressed={value === c.id}
          className={cx(
            'focus-ring flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium leading-tight transition active:scale-95',
            value === c.id ? 'bg-sky-400/20 ring-1 ring-sky-400/60' : 'bg-[rgb(var(--line)/0.05)] hover:bg-[rgb(var(--line)/0.1)]',
          )}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${c.color}26`, color: c.color }}>
            <Icon name={c.icon} size={18} />
          </span>
          <span className="w-full truncate text-center">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Поле суммы с цифровой клавиатурой на iPhone */
export function MoneyField({ value, onChange, autoFocus, placeholder = '0', label }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; placeholder?: string; label: string }) {
  return (
    <input
      className="field text-lg font-semibold tabular-nums"
      inputMode="decimal"
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
    />
  );
}

export const parseNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
