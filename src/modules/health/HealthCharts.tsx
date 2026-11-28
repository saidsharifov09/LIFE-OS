// Графики здоровья (отдельный чанк — Recharts тяжёлый): сон и вода — столбики, вес — линия, настроение/самочувствие — линии.
// У каждого графика подпись и переключатель «Таблица» — цвет не единственный носитель смысла.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2 } from 'lucide-react';
import { healthRange } from '@/actions';
import { useTheme } from '@/app/theme';
import { addDays, today } from '@/lib/dates';
import { SLEEP_GOAL, WATER_GOAL } from '@/lib/habits';
import { Button, Segmented } from '@/ui/primitives';

const C_SLEEP = '#818cf8';
const C_WATER = '#38bdf8';
const C_WEIGHT = '#2dd4bf';
const C_MOOD = '#fbbf24';
const C_FEEL = '#34d399';

export default function HealthCharts() {
  const { isDark } = useTheme();
  const [days, setDays] = useState<'14' | '30' | '90'>('14');
  const [table, setTable] = useState(false);
  const t0 = today();
  const from = addDays(t0, -(Number(days) - 1));
  const rows = useLiveQuery(() => healthRange(from, t0), [from, t0]) ?? [];
  const data = useMemo(() => {
    const m = new Map(rows.map((r) => [r.date, r]));
    return Array.from({ length: Number(days) }, (_, i) => {
      const d = addDays(from, i);
      const r = m.get(d);
      return { d, label: `${Number(d.slice(8))}.${d.slice(5, 7)}`, sleep: r?.sleep ?? null, water: r?.water ?? null, weight: r?.weight ?? null, mood: r?.mood ?? null, feeling: r?.feeling ?? null };
    });
  }, [rows, days, from]);

  const axis = isDark ? '#a8b5c7' : '#475569';
  const grid = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)';
  const tip = { background: isDark ? '#1e293b' : '#fff', border: 'none', borderRadius: 12, color: isDark ? '#f1f5f9' : '#0f172a', fontSize: 13 };
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: -18 } };
  const xAxis = <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />;
  const has = (k: keyof (typeof data)[number]) => data.some((x) => x[k] !== null);
  const avg = (k: 'sleep' | 'water' | 'mood' | 'feeling') => {
    const v = data.map((x) => x[k]).filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  };
  const weights = data.filter((x) => x.weight !== null);

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">Графики</h2>
        <Segmented className="!w-auto" value={days} onChange={setDays} options={[{ value: '14', label: '2 нед.' }, { value: '30', label: 'Месяц' }, { value: '90', label: '3 мес.' }]} />
        <Button size="sm" variant={table ? 'primary' : 'soft'} icon={<Table2 size={15} />} onClick={() => setTable(!table)} aria-pressed={table}>Таблица</Button>
      </div>
      {!rows.length ? <p className="py-10 text-center text-sm text-muted">Записывайте сон, воду и настроение — здесь появятся графики.</p> : table ? (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-[var(--bg)] text-xs text-muted"><tr><th className="py-1 text-left font-medium">Дата</th><th>Сон, ч</th><th>Вода</th><th>Вес</th><th>Настр.</th><th>Самоч.</th></tr></thead>
            <tbody>{[...data].reverse().map((r) => (
              <tr key={r.d} className="border-t border-[rgb(var(--line)/0.06)] text-center"><td className="py-1 text-left">{r.label}</td><td>{r.sleep ?? '—'}</td><td>{r.water ?? '—'}</td><td>{r.weight ?? '—'}</td><td>{r.mood ?? '—'}</td><td>{r.feeling ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Chart title="Сон" note={avg('sleep') !== null ? `в среднем ${avg('sleep')!.toLocaleString('ru-RU')} ч · линия — ${SLEEP_GOAL} ч` : ''} show={has('sleep')}>
            <BarChart {...common}>
              <CartesianGrid vertical={false} stroke={grid} />{xAxis}
              <YAxis tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 12]} />
              <Tooltip contentStyle={tip} cursor={{ fill: grid }} formatter={(v: number) => [`${v} ч`, 'Сон']} />
              <ReferenceLine y={SLEEP_GOAL} stroke={axis} strokeDasharray="4 4" />
              <Bar dataKey="sleep" name="Сон" fill={C_SLEEP} radius={[6, 6, 0, 0]} maxBarSize={22} />
            </BarChart>
          </Chart>
          <Chart title="Вода" note={avg('water') !== null ? `в среднем ${avg('water')!.toLocaleString('ru-RU')} стак. · линия — ${WATER_GOAL}` : ''} show={has('water')}>
            <BarChart {...common}>
              <CartesianGrid vertical={false} stroke={grid} />{xAxis}
              <YAxis tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tip} cursor={{ fill: grid }} formatter={(v: number) => [`${v} стак.`, 'Вода']} />
              <ReferenceLine y={WATER_GOAL} stroke={axis} strokeDasharray="4 4" />
              <Bar dataKey="water" name="Вода" fill={C_WATER} radius={[6, 6, 0, 0]} maxBarSize={22} />
            </BarChart>
          </Chart>
          <Chart title="Настроение и самочувствие" note="1 — плохо, 5 — отлично" show={has('mood') || has('feeling')}>
            <LineChart {...common}>
              <CartesianGrid vertical={false} stroke={grid} />{xAxis}
              <YAxis tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
              <Line dataKey="mood" name="Настроение" stroke={C_MOOD} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              <Line dataKey="feeling" name="Самочувствие" stroke={C_FEEL} strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3 }} connectNulls />
            </LineChart>
          </Chart>
          <Chart title="Вес" note={weights.length > 1 ? `${weights[0].weight} → ${weights[weights.length - 1].weight} кг` : ''} show={weights.length > 0}>
            <LineChart {...common}>
              <CartesianGrid vertical={false} stroke={grid} />{xAxis}
              <YAxis tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={tip} formatter={(v: number) => [`${v} кг`, 'Вес']} />
              <Line dataKey="weight" name="Вес" stroke={C_WEIGHT} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </Chart>
        </div>
      )}
    </div>
  );
}

function Chart({ title, note, show, children }: { title: string; note?: string; show: boolean; children: React.ReactElement }) {
  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between gap-2"><span className="font-medium">{title}</span><span className="text-xs text-muted">{note}</span></figcaption>
      {show ? <div className="h-48"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div> : <p className="grid h-48 place-items-center text-sm text-muted">Нет данных за период</p>}
    </figure>
  );
}
