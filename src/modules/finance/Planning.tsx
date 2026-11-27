// Вкладки планирования: бюджеты, регулярные платежи и подписки, долги, копилки.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Check as CheckIcon, HandCoins, PiggyBank, Plus, SkipForward, Target, Trash2, TriangleAlert } from 'lucide-react';
import type { Currency, DateStr, Debt, Recurrence, RecurringPayment, SavingsGoal } from '@/db/types';
import {
  addDebt, addRecurring, addSavings, deleteDebt, deleteRecurring, deleteSavings, listDebts, listRecurring, listSavings,
  monthlyCost, moveSavings, payRecurring, repayDebt, setBudget, skipRecurring, updateDebt, updateRecurring, updateSavings,
} from '@/actions';
import { EXPENSE_CATEGORIES, PALETTE, findCategory } from '@/lib/categories';
import { describeRecurrence, diffDays, fmtRelative, today } from '@/lib/dates';
import { budgetStates, TOTAL_BUDGET, toRub } from '@/lib/finance';
import { cx, fmtMoney, plural } from '@/lib/format';
import { Button, Card, Chip, Empty, Field, Input, Label, Segmented, Switch } from '@/ui/primitives';
import { Bar, fireConfetti, Ring } from '@/ui/feedback';
import { Sheet, useToast } from '@/ui/overlay';
import { CategoryBadge } from '@/ui/CategoryIcon';
import { RecurrencePicker } from '@/ui/RecurrencePicker';
import { IcsButton } from '@/ui/IcsButton';
import { AccountPicker, Amount, CategoryGrid, CurrencyPicker, MoneyField, parseNum, type FinanceData } from './shared';

// ====================== Бюджеты ======================
export function BudgetsTab({ data }: { data: FinanceData }) {
  const t0 = today();
  const states = budgetStates(data.budgets, data.txs, t0, data.rates);
  const byCat = new Map(states.map((s) => [s.budget.category, s]));
  const [edit, setEdit] = useState<string | null>(null);
  const total = byCat.get(TOTAL_BUDGET);
  const catStates = states.filter((s) => s.budget.category !== TOTAL_BUDGET);
  const unbudgeted = EXPENSE_CATEGORIES.filter((c) => !byCat.has(c.id));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Весь месяц" icon={<Target size={18} />} className="lg:col-span-2">
        {total ? <BudgetRow state={total} name="Общий бюджет" onEdit={() => setEdit(TOTAL_BUDGET)} /> : (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-muted">Общий лимит трат на месяц — по всем категориям сразу.</p>
            <Button size="sm" variant="soft" icon={<Plus size={15} />} onClick={() => setEdit(TOTAL_BUDGET)}>Задать</Button>
          </div>
        )}
      </Card>
      <Card title="По категориям" icon={<Target size={18} />} className="lg:col-span-2">
        {catStates.length === 0 && <p className="mb-3 text-sm text-muted">Задайте лимит для категорий, где легко потратить лишнее. При 80% полоса станет оранжевой, сверх лимита — красной.</p>}
        <ul className="space-y-4">
          {catStates.sort((a, b) => b.percent - a.percent).map((s) => (
            <li key={s.budget.id}><BudgetRow state={s} onEdit={() => setEdit(s.budget.category)} /></li>
          ))}
        </ul>
        {unbudgeted.length > 0 && (
          <>
            <Label className="mt-5">Добавить бюджет</Label>
            <div className="flex flex-wrap gap-1.5">
              {unbudgeted.map((c) => <Chip key={c.id} color={c.color} onClick={() => setEdit(c.id)}>{c.name}</Chip>)}
            </div>
          </>
        )}
      </Card>
      <BudgetEditor category={edit} current={edit ? byCat.get(edit)?.budget.amount : undefined} onClose={() => setEdit(null)} />
    </div>
  );
}

function BudgetRow({ state: s, name, onEdit }: { state: ReturnType<typeof budgetStates>[number]; name?: string; onEdit: () => void }) {
  const cat = findCategory(s.budget.category);
  return (
    <button onClick={onEdit} className="focus-ring block w-full rounded-2xl text-left">
      <div className="mb-1.5 flex items-center gap-3">
        {s.budget.category !== TOTAL_BUDGET && <CategoryBadge id={s.budget.category} size={34} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium">
            {name ?? cat?.name}
            {s.level === 'over' && <TriangleAlert size={15} className="text-red-500 dark:text-red-300" aria-label="Превышен" />}
          </span>
          <span className="text-xs text-muted tabular-nums">{fmtMoney(Math.round(s.spent))} из {fmtMoney(s.budget.amount)}</span>
        </span>
        <span className={cx('text-sm tabular-nums', s.level === 'over' ? 'font-semibold text-red-500 dark:text-red-300' : s.level === 'warn' ? 'text-amber-600 dark:text-amber-300' : 'text-muted')}>
          {s.level === 'over' ? `+${fmtMoney(Math.round(-s.left))} сверх` : `осталось ${fmtMoney(Math.round(s.left))}`}
        </span>
      </div>
      <Bar value={s.percent} danger={s.level === 'over'} warn={s.level === 'warn'} />
    </button>
  );
}

function BudgetEditor({ category, current, onClose }: { category: string | null; current?: number; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [last, setLast] = useState<string | null>(null);
  if (category !== last) { setLast(category); if (category) setValue(current ? String(current) : ''); }
  const name = category === TOTAL_BUDGET ? 'Весь месяц' : findCategory(category)?.name;
  const save = async (amount: number) => {
    await setBudget(category!, amount);
    toast.show(amount > 0 ? `Бюджет «${name}»: ${fmtMoney(amount)}` : 'Бюджет убран', { undo: true });
    onClose();
  };
  return (
    <Sheet open={!!category} onClose={onClose} title={`Бюджет: ${name ?? ''}`} footer={
      <div className="flex gap-2">
        {current && <Button variant="danger" onClick={() => save(0)}>Убрать</Button>}
        <Button variant="primary" className="flex-1" onClick={() => { const n = parseNum(value); if (n <= 0) { toast.show('Введите сумму', { tone: 'error' }); return; } save(n); }}>Готово</Button>
      </div>
    }>
      <Label>Лимит на месяц, ₽</Label>
      <MoneyField label="Лимит на месяц" value={value} onChange={setValue} autoFocus />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[3000, 5000, 10000, 20000, 50000].map((n) => <Chip key={n} onClick={() => setValue(String(n))}>{fmtMoney(n)}</Chip>)}
      </div>
      <p className="mt-3 text-xs text-muted">Бюджет повторяется каждый месяц. Траты в других валютах считаются по курсу из настроек.</p>
    </Sheet>
  );
}

// ====================== Регулярные платежи ======================
export function RecurringTab({ data }: { data: FinanceData }) {
  const toast = useToast();
  const items = useLiveQuery(listRecurring, []) ?? [];
  const [edit, setEdit] = useState<RecurringPayment | 'new' | null>(null);
  const t0 = today();
  const active = items.filter((r) => r.active);
  const perMonth = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyCost(r, data.rates), 0);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted">Регулярные расходы в месяц</p>
            <p className="text-2xl font-bold tabular-nums">≈ {fmtMoney(Math.round(perMonth))}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setEdit('new')}>Добавить</Button>
        </div>
      </Card>
      <Card title="Ближайшие списания" icon={<CalendarClock size={18} />}>
        {items.length === 0 ? (
          <Empty title="Нет регулярных платежей" hint="Аренда, интернет, подписки, кредит — платёж появится здесь заранее, оплата в одно касание." />
        ) : (
          <ul className="space-y-1">
            {items.map((r) => {
              const due = r.nextDate ? diffDays(t0, r.nextDate) : null;
              return (
                <li key={r.id} className={cx('flex items-center gap-2 rounded-2xl py-2 sm:px-2', !r.active && 'opacity-50')}>
                  <button className="focus-ring flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEdit(r)}>
                    <CategoryBadge id={r.category} kind={r.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium">
                        <span className="truncate">{r.title}</span>
                        {r.subscription && <span className="shrink-0 rounded-md bg-sky-400/15 px-1.5 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-200">подписка</span>}
                      </span>
                      <span className={cx('block truncate text-xs', due !== null && due < 0 ? 'text-red-500 dark:text-red-300' : 'text-muted')}>
                        {!r.active ? 'Пауза' : r.nextDate ? `${due! < 0 ? 'Просрочено · ' : ''}${fmtRelative(r.nextDate)}${due! > 1 ? ` · через ${due} ${plural(due!, ['день', 'дня', 'дней'])}` : ''}` : 'Завершён'} · {describeRecurrence(r.recurrence).toLowerCase()}
                      </span>
                      <Amount value={r.amount} currency={r.currency} type={r.kind === 'income' ? 'income' : undefined} className="text-sm sm:hidden" />
                    </span>
                    <Amount value={r.amount} currency={r.currency} type={r.kind === 'income' ? 'income' : undefined} className="hidden sm:inline" />
                  </button>
                  {r.active && r.nextDate && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" className="!h-10 !w-10" aria-label={`Пропустить ${r.title}`} title="Пропустить" onClick={async () => { await skipRecurring(r.id); toast.show('Пропущено', { undo: true }); }}><SkipForward size={17} /></Button>
                      <Button size="icon" variant="soft" className="!h-10 !w-10" aria-label={`Оплачено: ${r.title}`} title="Оплачено" onClick={async () => { await payRecurring(r.id); toast.show(`${r.kind === 'income' ? 'Получено' : 'Оплачено'}: ${r.title} ✓`, { undo: true }); }}><CheckIcon size={18} /></Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Платёж не списывается сам: нажмите ✓, когда оплатили — запишется расход, дата сдвинется на следующую.</p>
      </Card>
      <RecurringEditor item={edit === 'new' ? null : edit} open={!!edit} onClose={() => setEdit(null)} data={data} />
    </div>
  );
}

function RecurringEditor({ item, open, onClose, data }: { item: RecurringPayment | null; open: boolean; onClose: () => void; data: FinanceData }) {
  const toast = useToast();
  const [d, setD] = useState({
    title: '', amount: '', kind: 'expense' as 'expense' | 'income', currency: 'RUB' as Currency, category: 'subs' as string | null,
    accountId: null as string | null, startDate: today(), recurrence: { freq: 'monthly', interval: 1 } as Recurrence | null, subscription: true, active: true,
  });
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) setD(item ? {
      title: item.title, amount: String(item.amount), kind: item.kind, currency: item.currency, category: item.category ?? null,
      accountId: item.accountId ?? null, startDate: item.nextDate ?? item.startDate, recurrence: item.recurrence, subscription: !!item.subscription, active: item.active,
    } : {
      title: '', amount: '', kind: 'expense', currency: 'RUB', category: 'subs', accountId: data.accounts[0]?.id ?? null,
      startDate: today(), recurrence: { freq: 'monthly', interval: 1 }, subscription: true, active: true,
    });
  }
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const amount = parseNum(d.amount);
    if (!d.title.trim() || amount <= 0) { toast.show('Нужны название и сумма', { tone: 'error' }); return; }
    const recurrence = d.recurrence ?? { freq: 'monthly', interval: 1 };
    if (item) {
      const scheduleChanged = d.startDate !== (item.nextDate ?? item.startDate) || JSON.stringify(recurrence) !== JSON.stringify(item.recurrence);
      await updateRecurring(item.id, {
        title: d.title.trim(), amount, kind: d.kind, currency: d.currency, category: d.category, accountId: d.accountId,
        subscription: d.subscription, active: d.active, ...(scheduleChanged ? { startDate: d.startDate, recurrence } : {}),
      });
    } else {
      await addRecurring({ title: d.title.trim(), amount, kind: d.kind, currency: d.currency, category: d.category, accountId: d.accountId, startDate: d.startDate, recurrence, subscription: d.subscription });
    }
    toast.show(item ? 'Сохранено' : 'Платёж добавлен ✓', { undo: true });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Регулярный платёж' : 'Новый регулярный платёж'} footer={
      <div className="flex gap-2">
        {item && <Button variant="danger" size="icon" aria-label="Удалить платёж" onClick={async () => { await deleteRecurring(item.id); toast.show('Платёж удалён', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Segmented value={d.kind} onChange={(v) => setD((x) => ({ ...x, kind: v, category: v === 'income' ? 'salary' : 'subs', subscription: v === 'expense' && x.subscription }))} options={[{ value: 'expense', label: 'Платёж' }, { value: 'income', label: 'Доход' }]} />
        <Field label="Название"><Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Например: Интернет, Spotify, аренда" autoFocus={!item} /></Field>
        <div>
          <Label>Сумма</Label>
          <MoneyField label="Сумма" value={d.amount} onChange={(v) => set('amount', v)} />
          <div className="mt-2"><CurrencyPicker value={d.currency} onChange={(v) => set('currency', v)} /></div>
        </div>
        <Field label={item ? 'Ближайшая дата' : 'Первое списание'}><Input type="date" value={d.startDate} onChange={(e) => e.target.value && set('startDate', e.target.value as DateStr)} /></Field>
        <RecurrencePicker value={d.recurrence} onChange={(r) => set('recurrence', r ?? { freq: 'monthly', interval: 1 })} date={d.startDate} />
        <div><Label>Категория</Label><CategoryGrid kind={d.kind} value={d.category} onPick={(c) => set('category', c)} compact /></div>
        <div><Label>Счёт</Label><AccountPicker accounts={data.accounts} value={d.accountId} onChange={(v) => set('accountId', v)} allowNone /></div>
        {d.kind === 'expense' && (
          <div className="flex items-center gap-3"><span className="flex-1">Это подписка</span><Switch checked={d.subscription} onChange={(v) => set('subscription', v)} label="Подписка" /></div>
        )}
        {item && <div className="flex items-center gap-3"><span className="flex-1">Активен</span><Switch checked={d.active} onChange={(v) => set('active', v)} label="Активен" /></div>}
        {item && (
          <IcsButton item={() => ({
            uid: `pay-${item.id}`, title: `${d.kind === 'income' ? '💰' : '💳'} ${d.title.trim() || item.title} — ${fmtMoney(parseNum(d.amount) || item.amount, d.currency)}`,
            date: d.startDate, start: null, recurrence: d.recurrence,
            description: 'Регулярный платёж из Life OS. Отметьте «Оплачено» в приложении.',
          })} />
        )}
      </div>
    </Sheet>
  );
}

// ====================== Долги ======================
export function DebtsTab({ data }: { data: FinanceData }) {
  const toast = useToast();
  const debts = useLiveQuery(listDebts, []) ?? [];
  const [edit, setEdit] = useState<Debt | 'new' | null>(null);
  const [repay, setRepay] = useState<Debt | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const open = debts.filter((d) => !d.closed);
  const sum = (dir: Debt['direction']) => open.filter((d) => d.direction === dir).reduce((s, d) => s + toRub(d.amount - d.paid, d.currency, data.rates), 0);
  const groups: { dir: Debt['direction']; title: string }[] = [{ dir: 'they_owe', title: 'Мне должны' }, { dir: 'i_owe', title: 'Я должен' }];
  const t0 = today();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div><p className="text-sm text-muted">Мне должны</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(Math.round(sum('they_owe')))}</p></div>
          <div><p className="text-sm text-muted">Я должен</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(Math.round(sum('i_owe')))}</p></div>
          <Button variant="primary" size="sm" className="ml-auto" icon={<Plus size={15} />} onClick={() => setEdit('new')}>Долг</Button>
        </div>
        {open.some((d) => d.currency !== 'RUB') && <p className="mt-2 text-xs text-muted">Долги в других валютах пересчитаны в рубли по курсу из настроек.</p>}
      </Card>
      {groups.map((g) => {
        const list = debts.filter((d) => d.direction === g.dir && (showClosed || !d.closed));
        return (
          <Card key={g.dir} title={g.title} icon={<HandCoins size={18} />}>
            {list.length === 0 ? <p className="text-sm text-muted">Никого.</p> : (
              <ul className="space-y-3">
                {list.map((d) => {
                  const left = d.amount - d.paid;
                  const overdue = !d.closed && d.due && d.due < t0;
                  return (
                    <li key={d.id} className={cx(d.closed && 'opacity-60')}>
                      <div className="flex items-center gap-3">
                        <button className="focus-ring min-w-0 flex-1 text-left" onClick={() => setEdit(d)}>
                          <span className="block truncate font-medium">{d.person}</span>
                          <span className={cx('block truncate text-xs', overdue ? 'text-red-500 dark:text-red-300' : 'text-muted')}>
                            {d.closed ? 'Закрыт ✓' : d.due ? `${overdue ? 'Просрочено · ' : 'до '}${fmtRelative(d.due)}` : 'без срока'}{d.note ? ` · ${d.note}` : ''}
                          </span>
                        </button>
                        <span className="text-right">
                          <Amount value={d.closed ? d.amount : left} currency={d.currency} />
                          {d.paid > 0 && !d.closed && <span className="block text-xs text-muted">из {fmtMoney(d.amount, d.currency)}</span>}
                        </span>
                        {!d.closed && <Button size="sm" variant="soft" onClick={() => setRepay(d)}>Вернули</Button>}
                      </div>
                      {d.paid > 0 && !d.closed && <Bar value={(d.paid / d.amount) * 100} className="mt-2" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
      {debts.some((d) => d.closed) && (
        <Button variant="ghost" size="sm" className="lg:col-span-2" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Скрыть закрытые' : 'Показать закрытые'}</Button>
      )}
      <DebtEditor debt={edit === 'new' ? null : edit} open={!!edit} onClose={() => setEdit(null)} />
      <RepaySheet debt={repay} onClose={() => setRepay(null)} onDone={(full) => { toast.show(full ? 'Долг закрыт ✓' : 'Возврат записан', { undo: true }); if (full) fireConfetti(); }} />
    </div>
  );
}

function RepaySheet({ debt, onClose, onDone }: { debt: Debt | null; onClose: () => void; onDone: (full: boolean) => void }) {
  const [v, setV] = useState('');
  const [last, setLast] = useState<Debt | null>(null);
  if (debt !== last) { setLast(debt); if (debt) setV(String(debt.amount - debt.paid)); }
  if (!debt) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const left = debt.amount - debt.paid;
  return (
    <Sheet open={!!debt} onClose={onClose} title={`Возврат: ${debt.person}`} footer={
      <Button variant="primary" className="w-full" onClick={async () => { const n = Math.min(left, parseNum(v)); if (n <= 0) return; await repayDebt(debt.id, n); onDone(n >= left); onClose(); }}>Записать</Button>
    }>
      <Label>Сколько вернули (осталось {fmtMoney(left, debt.currency)})</Label>
      <MoneyField label="Сумма возврата" value={v} onChange={setV} autoFocus />
      <div className="mt-3 flex gap-1.5"><Chip onClick={() => setV(String(left))}>Всё</Chip><Chip onClick={() => setV(String(Math.round(left / 2)))}>Половину</Chip></div>
    </Sheet>
  );
}

function DebtEditor({ debt, open, onClose }: { debt: Debt | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ person: '', direction: 'they_owe' as Debt['direction'], amount: '', currency: 'RUB' as Currency, due: '' as string, note: '' });
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) setD(debt ? { person: debt.person, direction: debt.direction, amount: String(debt.amount), currency: debt.currency, due: debt.due ?? '', note: debt.note ?? '' }
      : { person: '', direction: 'they_owe', amount: '', currency: 'RUB', due: '', note: '' });
  }
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const amount = parseNum(d.amount);
    if (!d.person.trim() || amount <= 0) { toast.show('Нужны имя и сумма', { tone: 'error' }); return; }
    const fields = { person: d.person.trim(), direction: d.direction, amount, currency: d.currency, due: d.due || null, note: d.note };
    if (debt) await updateDebt(debt.id, { ...fields, closed: debt.paid >= amount });
    else await addDebt(fields);
    toast.show(debt ? 'Сохранено' : 'Долг записан ✓', { undo: true });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={debt ? 'Долг' : 'Новый долг'} footer={
      <div className="flex gap-2">
        {debt && <Button variant="danger" size="icon" aria-label="Удалить долг" onClick={async () => { await deleteDebt(debt.id); toast.show('Долг удалён', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        {debt?.closed && <Button variant="soft" onClick={async () => { await updateDebt(debt.id, { closed: false, paid: 0 }); toast.show('Долг снова открыт', { undo: true }); onClose(); }}>Открыть заново</Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Segmented value={d.direction} onChange={(v) => set('direction', v)} options={[{ value: 'they_owe', label: 'Мне должны' }, { value: 'i_owe', label: 'Я должен' }]} />
        <Field label="Кто"><Input value={d.person} onChange={(e) => set('person', e.target.value)} placeholder="Имя" autoFocus={!debt} /></Field>
        <div>
          <Label>Сумма</Label>
          <MoneyField label="Сумма долга" value={d.amount} onChange={(v) => set('amount', v)} />
          <div className="mt-2"><CurrencyPicker value={d.currency} onChange={(v) => set('currency', v)} /></div>
        </div>
        <Field label="Вернуть до (необязательно)"><Input type="date" value={d.due} onChange={(e) => set('due', e.target.value)} /></Field>
        <Field label="Заметка"><Input value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="За что" /></Field>
      </div>
    </Sheet>
  );
}

// ====================== Копилки ======================
export function SavingsTab({ data }: { data: FinanceData }) {
  const toast = useToast();
  const goals = useLiveQuery(listSavings, []) ?? [];
  const [edit, setEdit] = useState<SavingsGoal | 'new' | null>(null);
  const [move, setMove] = useState<{ goal: SavingsGoal; dir: 1 | -1 } | null>(null);
  const t0 = today();

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {goals.map((g) => {
        const pct = g.target > 0 ? (g.saved / g.target) * 100 : 0;
        const days = g.deadline ? diffDays(t0, g.deadline) : null;
        const months = days !== null && days > 0 ? Math.max(1, Math.ceil(days / 30.4)) : null;
        const perMonth = months ? Math.max(0, (g.target - g.saved) / months) : null;
        return (
          <Card key={g.id} className={cx(g.closed && 'opacity-60')}>
            <button className="focus-ring flex w-full items-center gap-4 rounded-2xl text-left" onClick={() => setEdit(g)}>
              <Ring value={pct} size={76} stroke={8} colors={[g.color, g.color]}>
                <span className="text-sm font-bold tabular-nums">{Math.floor(pct)}%</span>
              </Ring>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{g.name}</span>
                <span className="block text-sm tabular-nums">{fmtMoney(g.saved, g.currency)} <span className="text-muted">из {fmtMoney(g.target, g.currency)}</span></span>
                {g.deadline && <span className="block text-xs text-muted">к {fmtRelative(g.deadline)}{perMonth && pct < 100 ? ` · ≈ ${fmtMoney(Math.ceil(perMonth), g.currency)}/мес` : ''}</span>}
              </span>
            </button>
            {!g.closed && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" className="flex-1" icon={<Plus size={15} />} onClick={() => setMove({ goal: g, dir: 1 })}>Пополнить</Button>
                <Button size="sm" variant="soft" disabled={g.saved <= 0} onClick={() => setMove({ goal: g, dir: -1 })}>Забрать</Button>
              </div>
            )}
          </Card>
        );
      })}
      <Card className="flex items-center justify-center">
        <Empty icon={<PiggyBank size={26} />} title={goals.length ? 'Ещё одна цель?' : 'Копите на что-то?'} hint="Отпуск, ноутбук, подушка безопасности — видно, сколько осталось и сколько откладывать в месяц."
          action={<Button variant="soft" icon={<Plus size={16} />} onClick={() => setEdit('new')}>Новая копилка</Button>} />
      </Card>
      <SavingsEditor goal={edit === 'new' ? null : edit} open={!!edit} onClose={() => setEdit(null)} />
      <MoveSheet m={move} data={data} onClose={() => setMove(null)} onDone={(reached) => { toast.show(reached ? 'Цель достигнута! 🎉' : 'Готово ✓', { undo: true }); if (reached) fireConfetti(); }} />
    </div>
  );
}

function MoveSheet({ m, data, onClose, onDone }: { m: { goal: SavingsGoal; dir: 1 | -1 } | null; data: FinanceData; onClose: () => void; onDone: (reached: boolean) => void }) {
  const [v, setV] = useState('');
  const [acc, setAcc] = useState<string | null>(null);
  const [last, setLast] = useState<typeof m>(null);
  if (m !== last) { setLast(m); if (m) { setV(''); setAcc(data.accounts.find((a) => a.currency === m.goal.currency)?.id ?? null); } }
  const accounts = data.accounts.filter((a) => !m || a.currency === m.goal.currency);
  return (
    <Sheet open={!!m} onClose={onClose} title={m ? `${m.dir > 0 ? 'Пополнить' : 'Забрать из'} «${m.goal.name}»` : ''} footer={
      <Button variant="primary" className="w-full" onClick={async () => {
        if (!m) return;
        let n = parseNum(v);
        if (n <= 0) return;
        if (m.dir < 0) n = Math.min(n, m.goal.saved);
        await moveSavings(m.goal.id, n * m.dir, acc);
        onDone(m.dir > 0 && m.goal.saved < m.goal.target && m.goal.saved + n >= m.goal.target);
        onClose();
      }}>Готово</Button>
    }>
      {m && (
        <div className="space-y-4">
          <div><Label>Сумма</Label><MoneyField label="Сумма" value={v} onChange={setV} autoFocus /></div>
          <div className="flex flex-wrap gap-1.5">{[500, 1000, 5000, 10000].map((n) => <Chip key={n} onClick={() => setV(String(n))}>{fmtMoney(n, m.goal.currency)}</Chip>)}</div>
          <div>
            <Label>{m.dir > 0 ? 'Со счёта' : 'На счёт'}</Label>
            <AccountPicker accounts={accounts} value={acc} onChange={setAcc} allowNone />
            <p className="mt-1 text-xs text-muted">Со счёта — запишется перевод (это не расход). «Без счёта» — просто отметка в копилке.</p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function SavingsEditor({ goal, open, onClose }: { goal: SavingsGoal | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ name: '', target: '', currency: 'RUB' as Currency, deadline: '', color: PALETTE[1], saved: '' });
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) setD(goal ? { name: goal.name, target: String(goal.target), currency: goal.currency, deadline: goal.deadline ?? '', color: goal.color, saved: String(goal.saved) }
      : { name: '', target: '', currency: 'RUB', deadline: '', color: PALETTE[1], saved: '' });
  }
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const target = parseNum(d.target);
    if (!d.name.trim() || target <= 0) { toast.show('Нужны название и сумма цели', { tone: 'error' }); return; }
    const fields = { name: d.name.trim(), target, currency: d.currency, deadline: d.deadline || null, color: d.color };
    if (goal) await updateSavings(goal.id, fields);
    else await addSavings({ ...fields, saved: parseNum(d.saved) });
    toast.show(goal ? 'Сохранено' : 'Копилка создана ✓', { undo: true });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={goal ? 'Копилка' : 'Новая копилка'} footer={
      <div className="flex gap-2">
        {goal && <Button variant="danger" size="icon" aria-label="Удалить копилку" onClick={async () => { await deleteSavings(goal.id); toast.show('Копилка удалена', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        {goal && <Button variant="soft" onClick={async () => { await updateSavings(goal.id, { closed: !goal.closed }); onClose(); }}>{goal.closed ? 'Вернуть' : 'Завершить'}</Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Field label="На что копим"><Input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Например: Отпуск" autoFocus={!goal} /></Field>
        <div>
          <Label>Сколько нужно</Label>
          <MoneyField label="Цель" value={d.target} onChange={(v) => set('target', v)} />
          <div className="mt-2"><CurrencyPicker value={d.currency} onChange={(v) => set('currency', v)} /></div>
        </div>
        {!goal && <div><Label>Уже есть (необязательно)</Label><MoneyField label="Уже накоплено" value={d.saved} onChange={(v) => set('saved', v)} /></div>}
        <Field label="К какой дате (необязательно)"><Input type="date" value={d.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
        <div>
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={d.color === c} onClick={() => set('color', c)} className={cx('focus-ring h-8 w-8 rounded-full', d.color === c && 'ring-2 ring-sky-400 ring-offset-2 ring-offset-transparent')} style={{ background: c }} />)}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
