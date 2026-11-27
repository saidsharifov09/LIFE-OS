// Быстрый ввод расхода за 3 секунды: сумма на калькуляторе → тап по категории → готово.
// Калькулятор умеет «+» и «−» (например, 250+120). На ноутбуке работают цифры с клавиатуры.
import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';
import type { Transaction } from '@/db/types';
import { addExpense, addIncome } from '@/actions';
import { addDays, today } from '@/lib/dates';
import { evalAmount } from '@/lib/finance';
import { cx, fmtMoney } from '@/lib/format';
import { Chip, Input, Segmented } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { AccountPicker, CategoryGrid, useFinance } from './shared';

const KEYS = ['7', '8', '9', '+', '4', '5', '6', '−', '1', '2', '3', ',', '00', '0', '⌫'];

export function QuickMoney({ open, onClose, initialKind = 'expense' }: { open: boolean; onClose: () => void; initialKind?: 'expense' | 'income' }) {
  const data = useFinance();
  const toast = useToast();
  const [kind, setKind] = useState<'expense' | 'income'>(initialKind);
  const [expr, setExpr] = useState('');
  const [accountId, setAccountId] = useState<string | null | undefined>(undefined);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(initialKind); setExpr(''); setDate(today()); setNote(''); setAccountId(undefined);
  }, [open, initialKind]);

  const acc = accountId === undefined ? data?.accounts[0]?.id ?? null : accountId;
  const currency = data?.allAccounts.find((a) => a.id === acc)?.currency ?? 'RUB';
  const value = evalAmount(expr.replace(/[+−]$/, ''));

  const press = (k: string) => {
    setExpr((e) => {
      if (k === '⌫') return e.slice(0, -1);
      const isOp = k === '+' || k === '−';
      const last = e.slice(-1);
      if (isOp && (!e || last === '+' || last === '−')) return e.slice(0, e ? -1 : 0) + (e ? k : '');
      if (k === ',') {
        const lastNum = e.split(/[+−]/).pop() ?? '';
        if (lastNum.includes(',')) return e;
        return e + (lastNum ? ',' : '0,');
      }
      if (e.length >= 24) return e;
      return e + k;
    });
  };

  // Клавиатура ноутбука
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).closest('input, textarea')) return;
      const map: Record<string, string> = { '+': '+', '-': '−', ',': ',', '.': ',', Backspace: '⌫' };
      const k = /^\d$/.test(ev.key) ? ev.key : map[ev.key];
      if (k) { ev.preventDefault(); press(k); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const save = async (category: string) => {
    if (!value || value <= 0) { toast.show('Сначала введите сумму', { tone: 'error' }); return; }
    const fn = kind === 'income' ? addIncome : addExpense;
    const t: Transaction = await fn({ amount: value, currency, category, accountId: acc, date, note: note.trim() });
    toast.show(`${kind === 'income' ? 'Доход' : 'Расход'} ${fmtMoney(t.amount, t.currency)} ✓`, { undo: true });
    onClose();
  };

  const t0 = today();

  return (
    <Sheet open={open} onClose={onClose} title={kind === 'income' ? 'Быстрый доход' : 'Быстрый расход'}>
      <div className="space-y-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Расход' }, { value: 'income', label: 'Доход' }]} />
        <div className="rounded-3xl bg-[rgb(var(--line)/0.05)] px-4 py-3 text-right" aria-live="polite">
          <div className="h-5 truncate text-sm text-muted">{/[+−]/.test(expr) ? expr : ' '}</div>
          <div className={cx('truncate text-4xl font-bold tabular-nums', !value && 'text-muted')} data-testid="quick-amount">
            {fmtMoney(value && value > 0 ? value : 0, currency)}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              aria-label={k === '⌫' ? 'Стереть' : k === '−' ? 'Минус' : k}
              className={cx(
                'focus-ring h-12 rounded-2xl text-xl font-semibold tabular-nums transition active:scale-95',
                k === '+' || k === '−' ? 'bg-sky-400/15 text-sky-700 dark:text-sky-200' : 'bg-[rgb(var(--line)/0.07)] hover:bg-[rgb(var(--line)/0.12)]',
                k === '⌫' && 'grid place-items-center',
              )}
            >
              {k === '⌫' ? <Delete size={20} /> : k}
            </button>
          ))}
          <button type="button" onClick={() => setExpr('')} className="focus-ring h-12 rounded-2xl bg-[rgb(var(--line)/0.07)] text-sm font-semibold text-muted active:scale-95">C</button>
        </div>

        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted">Категория — нажмите, чтобы сохранить</p>
        <CategoryGrid kind={kind} onPick={save} compact />

        {data && data.accounts.length > 0 && <AccountPicker accounts={data.accounts} value={acc} onChange={setAccountId} allowNone />}
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={date === t0} onClick={() => setDate(t0)}>Сегодня</Chip>
          <Chip active={date === addDays(t0, -1)} onClick={() => setDate(addDays(t0, -1))}>Вчера</Chip>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий (необязательно)" className="!w-auto min-w-0 flex-1 !py-1.5 text-sm" aria-label="Комментарий" />
        </div>
      </div>
    </Sheet>
  );
}
