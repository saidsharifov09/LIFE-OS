// Редактор операции: расход, доход или перевод между счетами.
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Currency, DateStr, Transaction } from '@/db/types';
import { addExpense, addIncome, addTransfer, deleteTransaction, updateTransaction } from '@/actions';
import { addDays, today } from '@/lib/dates';
import { convert } from '@/lib/finance';
import { CURRENCY_SIGN } from '@/lib/format';
import { Button, Chip, Field, Input, Label, Segmented } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { AccountPicker, CategoryGrid, CurrencyPicker, MoneyField, parseNum, type FinanceData } from './shared';

type Kind = Transaction['type'];

export function TxEditor({ open, onClose, tx, data, initialType = 'expense' }: {
  open: boolean; onClose: () => void; tx?: Transaction | null; data: FinanceData; initialType?: Kind;
}) {
  const toast = useToast();
  const [type, setType] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('RUB');
  const [category, setCategory] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [toAmount, setToAmount] = useState('');
  const [date, setDate] = useState<DateStr>(today());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = data.accounts[0];
    setType(tx?.type ?? initialType);
    setAmount(tx ? String(tx.amount).replace('.', ',') : '');
    setCurrency(tx?.currency ?? first?.currency ?? 'RUB');
    setCategory(tx?.category ?? null);
    setAccountId(tx ? tx.accountId ?? null : first?.id ?? null);
    setToAccountId(tx?.toAccountId ?? data.accounts.find((a) => a.id !== first?.id)?.id ?? null);
    setToAmount(tx?.toAmount != null ? String(tx.toAmount).replace('.', ',') : '');
    setDate(tx?.date ?? today());
    setNote(tx?.note ?? '');
  }, [open, tx, initialType, data.accounts]);

  const from = data.allAccounts.find((a) => a.id === accountId);
  const to = data.allAccounts.find((a) => a.id === toAccountId);
  const crossCurrency = type === 'transfer' && from && to && from.currency !== to.currency;
  const isSavingsTx = !!tx?.savingsId;

  const pickAccount = (id: string | null) => {
    setAccountId(id);
    const acc = data.allAccounts.find((a) => a.id === id);
    if (acc && !tx) setCurrency(acc.currency);
  };

  const save = async () => {
    const n = parseNum(amount);
    if (n <= 0) { toast.show('Введите сумму', { tone: 'error' }); return; }
    if (type === 'transfer') {
      if (!accountId || !toAccountId || accountId === toAccountId) { toast.show('Выберите два разных счёта', { tone: 'error' }); return; }
      const ta = crossCurrency ? parseNum(toAmount) || null : null;
      if (tx) await updateTransaction(tx.id, { type, amount: n, currency: from!.currency, accountId, toAccountId, toAmount: ta, category: null, date, note });
      else await addTransfer({ fromId: accountId, toId: toAccountId, amount: n, toAmount: ta, date, note });
    } else {
      const fields = { amount: n, currency, category: category ?? (type === 'income' ? 'other-in' : 'other'), accountId, date, note };
      if (tx) await updateTransaction(tx.id, { ...fields, type, toAccountId: null, toAmount: null });
      else await (type === 'income' ? addIncome : addExpense)(fields);
    }
    toast.show(tx ? 'Сохранено' : type === 'transfer' ? 'Перевод записан ✓' : type === 'income' ? 'Доход записан ✓' : 'Расход записан ✓', { undo: true });
    onClose();
  };

  const t0 = today();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx ? 'Операция' : 'Новая операция'}
      footer={
        <div className="flex gap-2">
          {tx && (
            <Button variant="danger" size="icon" aria-label="Удалить операцию" onClick={async () => { await deleteTransaction(tx.id); toast.show('Операция удалена', { undo: true }); onClose(); }}>
              <Trash2 size={18} />
            </Button>
          )}
          <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!isSavingsTx && (
          <Segmented<Kind>
            value={type}
            onChange={setType}
            options={[{ value: 'expense', label: 'Расход' }, { value: 'income', label: 'Доход' }, { value: 'transfer', label: 'Перевод' }]}
          />
        )}
        <div>
          <Label>Сумма{type === 'transfer' && from ? `, ${CURRENCY_SIGN[from.currency]}` : ''}</Label>
          <MoneyField label="Сумма" value={amount} onChange={setAmount} autoFocus={!tx} />
          {type !== 'transfer' && <div className="mt-2"><CurrencyPicker value={currency} onChange={setCurrency} /></div>}
        </div>

        {type === 'transfer' ? (
          <>
            <div><Label>Откуда</Label><AccountPicker accounts={data.accounts} value={accountId} onChange={pickAccount} /></div>
            <div><Label>Куда</Label><AccountPicker accounts={data.accounts} value={toAccountId} onChange={setToAccountId} exclude={accountId} /></div>
            {crossCurrency && (
              <div>
                <Label>Пришло на «{to!.name}», {CURRENCY_SIGN[to!.currency]}</Label>
                <MoneyField
                  label="Сумма зачисления"
                  value={toAmount}
                  onChange={setToAmount}
                  placeholder={`по курсу ≈ ${Math.round(convert(parseNum(amount), from!.currency, to!.currency, data.rates) * 100) / 100}`}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div><Label>Категория</Label><CategoryGrid kind={type} value={category} onPick={setCategory} compact /></div>
            <div><Label>Счёт</Label><AccountPicker accounts={data.accounts} value={accountId} onChange={pickAccount} allowNone /></div>
          </>
        )}

        <div>
          <Label>Дата</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={date === t0} onClick={() => setDate(t0)}>Сегодня</Chip>
            <Chip active={date === addDays(t0, -1)} onClick={() => setDate(addDays(t0, -1))}>Вчера</Chip>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto !py-1.5" aria-label="Дата" />
          </div>
        </div>
        <Field label="Комментарий"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: обед с коллегами" /></Field>
      </div>
    </Sheet>
  );
}
