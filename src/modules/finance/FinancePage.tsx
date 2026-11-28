// Раздел «Финансы»: обзор (счета, месяц, ближайшие платежи), операции, бюджеты, платежи, долги, копилки, аналитика, настройки.
import { lazy, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight, Calculator, CalendarClock, HandCoins, PiggyBank, Plus, Receipt, Search, Settings2, Target,
  TrendingDown, TrendingUp, TriangleAlert, Wallet,
} from 'lucide-react';
import type { Account, Transaction } from '@/db/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { addAccount, deleteAccount, listRecurring, payRecurring, updateAccount } from '@/actions';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PALETTE, findCategory } from '@/lib/categories';
import { endOfMonth, fmtRelative, startOfMonth, today } from '@/lib/dates';
import { budgetStates, totalBalanceRub, totals } from '@/lib/finance';
import { cx, fmtMoney, plural } from '@/lib/format';
import { Button, Card, Chip, Empty, Field, Input, Label, PageHeader } from '@/ui/primitives';
import { Bar } from '@/ui/feedback';
import { Sheet, useToast } from '@/ui/overlay';
import { ACCOUNT_KINDS, AccountIcon, CategoryBadge } from '@/ui/CategoryIcon';
import { Amount, CurrencyPicker, MoneyField, parseNum, useFinance, type FinanceData } from './shared';
import { TxEditor } from './TxEditor';
import { useOpenParam } from '@/app/useOpenParam';
import { QuickMoney } from './QuickMoney';
import { BudgetsTab, DebtsTab, RecurringTab, SavingsTab } from './Planning';
import { FinanceSettings } from './FinanceSettings';

const AnalyticsTab = lazy(() => import('./Analytics'));

const TABS = [
  { id: 'overview', label: 'Обзор', icon: Wallet },
  { id: 'ops', label: 'Операции', icon: Receipt },
  { id: 'budgets', label: 'Бюджеты', icon: Target },
  { id: 'recurring', label: 'Платежи', icon: CalendarClock },
  { id: 'debts', label: 'Долги', icon: HandCoins },
  { id: 'savings', label: 'Копилки', icon: PiggyBank },
  { id: 'analytics', label: 'Аналитика', icon: TrendingUp },
  { id: 'settings', label: 'Настройки', icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId;
  const setTab = (t: TabId) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const data = useFinance();
  const [quick, setQuick] = useState(false);
  const [editor, setEditor] = useState<{ tx?: Transaction | null; type?: Transaction['type'] } | null>(null);
  // Переход из поиска: ?tab=ops&open=<id> — открыть операцию
  useOpenParam('open', (id) => {
    if (!data) return false;
    const tx = data.txs.find((t) => t.id === id);
    if (tx) setEditor({ tx });
  });

  return (
    <>
      <PageHeader
        title="Финансы"
        action={
          <div className="flex gap-2">
            <Button variant="soft" size="icon" aria-label="Новая операция" onClick={() => setEditor({})}><Plus size={20} /></Button>
            <Button variant="primary" icon={<Calculator size={18} />} onClick={() => setQuick(true)}>Расход</Button>
          </div>
        }
      />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0" role="tablist" aria-label="Разделы финансов">
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} icon={<t.icon size={14} />}>{t.label}</Chip>
        ))}
      </div>

      {!data ? <div className="h-40" /> : (
        <>
          {tab === 'overview' && <Overview data={data} onTx={(tx) => setEditor({ tx })} onNew={(type) => setEditor({ type })} onAll={() => setTab('ops')} onTab={setTab} />}
          {tab === 'ops' && <OpsTab data={data} onTx={(tx) => setEditor({ tx })} />}
          {tab === 'budgets' && <BudgetsTab data={data} />}
          {tab === 'recurring' && <RecurringTab data={data} />}
          {tab === 'debts' && <DebtsTab data={data} />}
          {tab === 'savings' && <SavingsTab data={data} />}
          {tab === 'analytics' && <Suspense fallback={<div className="h-60" />}><AnalyticsTab data={data} /></Suspense>}
          {tab === 'settings' && <FinanceSettings data={data} />}
          <TxEditor open={!!editor} onClose={() => setEditor(null)} tx={editor?.tx} initialType={editor?.type} data={data} />
        </>
      )}
      <QuickMoney open={quick} onClose={() => setQuick(false)} />
    </>
  );
}

// ---------------- Обзор ----------------
function Overview({ data, onTx, onNew, onAll, onTab }: { data: FinanceData; onTx: (t: Transaction) => void; onNew: (type: Transaction['type']) => void; onAll: () => void; onTab: (t: TabId) => void }) {
  const t0 = today();
  const month = totals(data.txs, startOfMonth(t0), endOfMonth(t0), data.rates);
  const total = totalBalanceRub(data.allAccounts, data.txs, data.rates);
  const states = budgetStates(data.budgets, data.txs, t0, data.rates).filter((s) => s.level !== 'ok');
  const upcoming = useLiveQuery(async () => (await listRecurring()).filter((r) => r.active && r.nextDate).slice(0, 4), []) ?? [];
  const [acc, setAcc] = useState<Account | 'new' | null>(null);
  const toast = useToast();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-sm text-muted">Всего на счетах</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight" data-testid="total-balance">{fmtMoney(Math.round(total))}</p>
          </div>
          <div className="flex gap-6">
            <div><p className="flex items-center gap-1 text-xs text-muted"><TrendingUp size={13} />Доход за месяц</p><Amount value={month.income} type="income" className="text-lg" /></div>
            <div><p className="flex items-center gap-1 text-xs text-muted"><TrendingDown size={13} />Расход за месяц</p><Amount value={month.expense} className="text-lg" /></div>
          </div>
        </div>
      </Card>

      <Card title="Счета" icon={<Wallet size={18} />} action={<Button size="sm" variant="soft" icon={<Plus size={15} />} onClick={() => setAcc('new')}>Счёт</Button>}>
        {data.accounts.length === 0 ? (
          <Empty title="Добавьте первый счёт" hint="Наличные, карта или накопительный — остаток будет считаться по операциям." />
        ) : (
          <ul className="space-y-1">
            {data.accounts.map((a) => (
              <li key={a.id}>
                <button onClick={() => setAcc(a)} className="focus-ring flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-[rgb(var(--line)/0.05)]">
                  <AccountIcon kind={a.kind} color={a.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="text-xs text-muted">{ACCOUNT_KINDS.find((k) => k.id === a.kind)?.name}</span>
                  </span>
                  <Amount value={data.balances.get(a.id) ?? 0} currency={a.currency} className={cx((data.balances.get(a.id) ?? 0) < 0 && 'text-red-500 dark:text-red-300')} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {data.accounts.length >= 2 && (
          <Button size="sm" variant="ghost" className="mt-2" icon={<ArrowLeftRight size={15} />} onClick={() => onNew('transfer')}>Перевод между счетами</Button>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {states.length > 0 && (
          <Card title="Бюджеты" icon={<TriangleAlert size={18} />} action={<button className="text-sm text-sky-600 dark:text-sky-300" onClick={() => onTab('budgets')}>Все</button>}>
            <ul className="space-y-3">
              {states.map((s) => (
                <li key={s.budget.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{s.budget.category === '__total' ? 'Весь месяц' : findCategory(s.budget.category)?.name}</span>
                    <span className={cx('tabular-nums', s.level === 'over' ? 'font-semibold text-red-500 dark:text-red-300' : 'text-muted')}>
                      {s.level === 'over' ? `сверх на ${fmtMoney(Math.round(-s.left))}` : `осталось ${fmtMoney(Math.round(s.left))}`}
                    </span>
                  </div>
                  <Bar value={s.percent} danger={s.level === 'over'} warn={s.level === 'warn'} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Ближайшие платежи" icon={<CalendarClock size={18} />} action={<button className="text-sm text-sky-600 dark:text-sky-300" onClick={() => onTab('recurring')}>Все</button>}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Добавьте подписки и регулярные платежи — здесь будет видно, что спишется скоро.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((r) => {
                const overdue = r.nextDate! < t0;
                return (
                  <li key={r.id} className="flex items-center gap-3 py-1">
                    <CategoryBadge id={r.category} kind={r.kind} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{r.title}</span>
                      <span className={cx('text-xs', overdue ? 'text-red-500 dark:text-red-300' : 'text-muted')}>{overdue ? 'Просрочено · ' : ''}{fmtRelative(r.nextDate!)}</span>
                    </span>
                    <Amount value={r.amount} currency={r.currency} />
                    {r.nextDate! <= t0 && (
                      <Button size="sm" variant="soft" onClick={async () => { await payRecurring(r.id); toast.show(`Оплачено: ${r.title}`, { undo: true }); }}>Оплатить</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Последние операции" icon={<Receipt size={18} />} className="lg:col-span-2" action={<button className="text-sm text-sky-600 dark:text-sky-300" onClick={onAll}>Все</button>}>
        {data.txs.length === 0 ? (
          <Empty title="Операций пока нет" hint="Нажмите «Расход» вверху — сумма, категория, готово. Или «кофе 250» через «+»." />
        ) : (
          <TxList txs={data.txs.slice(0, 6)} data={data} onTx={onTx} />
        )}
      </Card>

      <AccountEditor open={!!acc} account={acc === 'new' ? null : acc} onClose={() => setAcc(null)} balance={acc && acc !== 'new' ? data.balances.get(acc.id) ?? 0 : 0} />
    </div>
  );
}

// ---------------- Список операций ----------------
export function TxList({ txs, data, onTx }: { txs: Transaction[]; data: FinanceData; onTx: (t: Transaction) => void }) {
  const accName = (id?: string | null) => data.allAccounts.find((a) => a.id === id)?.name;
  // Группы по дням
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const t of txs) {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.date}>
          <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted">{fmtRelative(g.date)}</p>
          <ul>
            {g.items.map((t) => {
              const cat = t.type === 'transfer' ? null : findCategory(t.category, t.type);
              const title = t.type === 'transfer'
                ? (t.note || (t.savingsId ? 'Копилка' : `${accName(t.accountId) ?? '—'} → ${accName(t.toAccountId) ?? '—'}`))
                : t.note || cat?.name || 'Операция';
              return (
                <li key={t.id}>
                  <button onClick={() => onTx(t)} className="focus-ring flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-[rgb(var(--line)/0.05)]">
                    {t.type === 'transfer'
                      ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-400/15 text-sky-500">{t.savingsId ? <PiggyBank size={19} /> : <ArrowLeftRight size={19} />}</span>
                      : <CategoryBadge id={t.category} kind={t.type} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{title}</span>
                      <span className="block truncate text-xs text-muted">
                        {t.type === 'transfer' ? 'Перевод' : cat?.name}{accName(t.accountId) && t.type !== 'transfer' ? ` · ${accName(t.accountId)}` : ''}
                      </span>
                    </span>
                    <Amount value={t.amount} currency={t.currency} type={t.type} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OpsTab({ data, onTx }: { data: FinanceData; onTx: (t: Transaction) => void }) {
  const [type, setType] = useState<'all' | Transaction['type']>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [acc, setAcc] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.txs.filter((t) =>
      (type === 'all' || t.type === type) && (!cat || t.category === cat) && (!acc || t.accountId === acc || t.toAccountId === acc)
      && (!s || (t.note ?? '').toLowerCase().includes(s) || String(t.amount).includes(s)));
  }, [data.txs, type, cat, acc, q]);
  const sum = totals(filtered, '0000-00-00', '9999-99-99', data.rates);
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Card>
      <div className="space-y-2">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по комментарию или сумме" className="!pl-9" aria-label="Поиск операций" />
        </label>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {([['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы']] as const).map(([v, l]) => (
            <Chip key={v} active={type === v} onClick={() => { setType(v); setCat(null); }}>{l}</Chip>
          ))}
          {data.accounts.length > 1 && <span className="mx-1 w-px shrink-0 bg-[rgb(var(--line)/0.12)]" />}
          {data.accounts.length > 1 && data.accounts.map((a) => (
            <Chip key={a.id} active={acc === a.id} onClick={() => setAcc(acc === a.id ? null : a.id)}>{a.name}</Chip>
          ))}
        </div>
        {type !== 'transfer' && type !== 'all' && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {cats.map((c) => <Chip key={c.id} color={c.color} active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.name}</Chip>)}
          </div>
        )}
        <p className="px-1 text-sm text-muted">
          {filtered.length} {plural(filtered.length, ['операция', 'операции', 'операций'])}
          {sum.expense > 0 && <> · расходы <b className="text-fg">{fmtMoney(Math.round(sum.expense))}</b></>}
          {sum.income > 0 && <> · доходы <b className="text-fg">{fmtMoney(Math.round(sum.income))}</b></>}
        </p>
      </div>
      <div className="mt-3">
        {filtered.length === 0 ? <Empty title="Ничего не найдено" /> : <TxList txs={filtered.slice(0, limit)} data={data} onTx={onTx} />}
        {filtered.length > limit && <Button variant="soft" className="mt-3 w-full" onClick={() => setLimit(limit + 100)}>Показать ещё</Button>}
      </div>
    </Card>
  );
}

// ---------------- Редактор счёта ----------------
function AccountEditor({ open, account, onClose, balance }: { open: boolean; account: Account | null; onClose: () => void; balance: number }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('card');
  const [currency, setCurrency] = useState<Account['currency']>('RUB');
  const [initial, setInitial] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(account?.name ?? ''); setKind(account?.kind ?? 'card'); setCurrency(account?.currency ?? 'RUB');
      setInitial(account ? String(account.initialBalance).replace('.', ',') : ''); setColor(account?.color ?? PALETTE[0]);
    }
  }

  const save = async () => {
    if (!name.trim()) { toast.show('Введите название', { tone: 'error' }); return; }
    const fields = { name: name.trim(), kind, currency, initialBalance: parseNum(initial), color };
    if (account) await updateAccount(account.id, fields);
    else await addAccount(fields);
    toast.show(account ? 'Счёт сохранён' : 'Счёт добавлен ✓', { undo: true });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={account ? 'Счёт' : 'Новый счёт'} footer={
      <div className="flex gap-2">
        {account && (
          <Button variant="danger" onClick={async () => {
            if (!confirm(`Удалить счёт «${account.name}»? Операции останутся в истории без счёта.`)) return;
            await deleteAccount(account.id); toast.show('Счёт удалён', { undo: true }); onClose();
          }}>Удалить</Button>
        )}
        {account && <Button variant="soft" onClick={async () => { await updateAccount(account.id, { archived: true }); toast.show('Счёт в архиве', { undo: true }); onClose(); }}>В архив</Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Тинькофф" autoFocus={!account} /></Field>
        <div>
          <Label>Тип</Label>
          <div className="flex flex-wrap gap-1.5">{ACCOUNT_KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.name}</Chip>)}</div>
        </div>
        <div><Label>Валюта</Label><CurrencyPicker value={currency} onChange={setCurrency} /></div>
        <div>
          <Label>Начальный остаток</Label>
          <MoneyField label="Начальный остаток" value={initial} onChange={setInitial} />
          {account && <p className="mt-1 text-xs text-muted">Текущий остаток: {fmtMoney(balance, account.currency)} (начальный + операции)</p>}
        </div>
        <div>
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                className={cx('focus-ring h-8 w-8 rounded-full', color === c && 'ring-2 ring-offset-2 ring-offset-transparent ring-sky-400')} style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
