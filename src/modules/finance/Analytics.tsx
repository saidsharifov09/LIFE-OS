// Аналитика финансов: структура трат по категориям, доход/расход по месяцам, темп трат месяца.
// Грузится отдельно (Recharts тяжёлый). Цвета серий проверены на различимость (в т.ч. дальтонизм),
// у каждого графика есть подписи и таблица значений — цвет не единственный носитель смысла.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import { useTheme } from '@/app/theme';
import { findCategory } from '@/lib/categories';
import { addMonths, endOfMonth, fromDateStr, MONTHS_NOM, startOfMonth, today } from '@/lib/dates';
import { byCategory, cumulativeSpend, monthlySeries, totals } from '@/lib/finance';
import { cx, fmtMoney } from '@/lib/format';
import { Button, Card, Empty, Segmented } from '@/ui/primitives';
import { CategoryBadge } from '@/ui/CategoryIcon';
import type { FinanceData } from './shared';

/** Серии: доход — изумрудный, расход — индиго (красный оставлен для превышений бюджета) */
const C_INCOME = '#10b981';
const C_EXPENSE = '#818cf8';

const short = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}к` : String(Math.round(n)));

export default function Analytics({ data }: { data: FinanceData }) {
  const { isDark } = useTheme();
  const [month, setMonth] = useState(startOfMonth(today()));
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [table, setTable] = useState(false);
  const axis = isDark ? '#a8b5c7' : '#475569';
  const grid = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)';
  const tip = { background: isDark ? '#1e293b' : '#fff', border: 'none', borderRadius: 12, color: isDark ? '#f1f5f9' : '#0f172a', fontSize: 13 };

  const from = month, to = endOfMonth(month);
  const cats = useMemo(() => byCategory(data.txs, from, to, data.rates, kind), [data, from, to, kind]);
  const sum = totals(data.txs, from, to, data.rates);
  const series = useMemo(() => monthlySeries(data.txs, month, 6, data.rates), [data, month]);
  const pace = useMemo(() => cumulativeSpend(data.txs, month, data.rates, today()), [data, month]);
  const prev = totals(data.txs, addMonths(month, -1), endOfMonth(addMonths(month, -1)), data.rates);
  const isCurrent = month === startOfMonth(today());
  const monthName = `${MONTHS_NOM[fromDateStr(month).getMonth()]} ${month.slice(0, 4)}`;
  const catTotal = cats.reduce((s, c) => s + c.amount, 0);
  const max = cats[0]?.amount ?? 1;

  // Сравнение с прошлым месяцем на тот же день
  const dayIdx = isCurrent ? Number(today().slice(8)) - 1 : pace.length - 1;
  const curPace = pace[dayIdx]?.current ?? 0;
  const prevPace = pace[Math.min(dayIdx, pace.length - 1)]?.previous ?? 0;
  const diff = prevPace > 0 ? Math.round(((curPace - prevPace) / prevPace) * 100) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" aria-label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={20} /></Button>
          <h2 className="flex-1 text-center text-lg font-semibold">{monthName}</h2>
          <Button size="icon" variant="ghost" aria-label="Следующий месяц" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={20} /></Button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Доход" value={fmtMoney(Math.round(sum.income))} />
          <Stat label="Расход" value={fmtMoney(Math.round(sum.expense))} />
          <Stat label="Итог" value={`${sum.net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(Math.round(sum.net)))}`} />
        </div>
        {prev.expense > 0 && (
          <p className="mt-3 text-center text-sm text-muted">
            Прошлый месяц: расход {fmtMoney(Math.round(prev.expense))}
            {diff !== null && isCurrent && <> · сейчас вы тратите {diff > 0 ? <b className="text-fg">на {diff}% больше</b> : <b className="text-fg">на {Math.abs(diff)}% меньше</b>}, чем к этому дню прошлого месяца</>}
          </p>
        )}
      </Card>

      <Card title="По категориям" action={<Segmented className="!w-auto" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' }]} />}>
        {cats.length === 0 ? <Empty title="Нет операций за месяц" /> : (
          <ul className="space-y-2.5">
            {cats.map((c) => {
              const def = findCategory(c.category, kind);
              return (
                <li key={c.category} className="flex items-center gap-3">
                  <CategoryBadge id={c.category} kind={kind} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{def?.name ?? c.category}</span>
                      <span className="shrink-0 tabular-nums"><b>{fmtMoney(Math.round(c.amount))}</b> <span className="text-muted">{Math.round((c.amount / catTotal) * 100)}%</span></span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-[rgb(var(--line)/0.06)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (c.amount / max) * 100)}%`, background: def?.color ?? '#94a3b8' }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Темп трат за месяц">
        <div className="h-56" role="img" aria-label={`Накопленные траты: ${monthName} и прошлый месяц`}>
          <ResponsiveContainer>
            <LineChart data={pace} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} interval={6} />
              <YAxis tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={short} width={48} />
              <Tooltip contentStyle={tip} labelFormatter={(d) => `${d}-е число`} formatter={(v: number, n) => [fmtMoney(Math.round(v)), n]} />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} iconType="plainline" />
              <Line type="monotone" dataKey="previous" name="Прошлый месяц" stroke={axis} strokeDasharray="4 4" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="current" name="Этот месяц" stroke={C_EXPENSE} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Доход и расход по месяцам" className="lg:col-span-2" action={
        <Button size="sm" variant={table ? 'soft' : 'ghost'} icon={<Table2 size={15} />} onClick={() => setTable(!table)} aria-pressed={table}>Таблица</Button>
      }>
        {table ? (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-1.5 font-medium">Месяц</th><th className="py-1.5 text-right font-medium">Доход</th><th className="py-1.5 text-right font-medium">Расход</th><th className="py-1.5 text-right font-medium">Итог</th></tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.month} className="hairline border-t">
                  <td className="py-1.5">{s.label} {s.month.slice(0, 4)}</td>
                  <td className="py-1.5 text-right">{fmtMoney(Math.round(s.income))}</td>
                  <td className="py-1.5 text-right">{fmtMoney(Math.round(s.expense))}</td>
                  <td className={cx('py-1.5 text-right font-medium')}>{s.income - s.expense >= 0 ? '+' : '−'}{fmtMoney(Math.abs(Math.round(s.income - s.expense)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-64" role="img" aria-label="Доход и расход за 6 месяцев">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: -12, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={short} width={48} />
                <Tooltip contentStyle={tip} cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v: number, n) => [fmtMoney(Math.round(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 12, color: axis }} iconType="circle" />
                <Bar dataKey="income" name="Доход" fill={C_INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" name="Расход" fill={C_EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[rgb(var(--line)/0.05)] px-2 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
