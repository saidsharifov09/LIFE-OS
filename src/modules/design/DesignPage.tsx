// Витрина дизайн-системы «Glassy»: все базовые элементы на одной странице.
import { useState } from 'react';
import { Area, AreaChart, Bar as RBar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Bell, Heart, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, Chip, Empty, Field, Input, PageHeader, Segmented, Switch, Textarea } from '@/ui/primitives';
import { Bar, Check, Ring, fireConfetti } from '@/ui/feedback';
import { Sheet, useToast } from '@/ui/overlay';
import { useTheme } from '@/app/theme';

const COLORS = [
  { name: 'Голубой', hex: '#38bdf8' }, { name: 'Бирюзовый', hex: '#2dd4bf' }, { name: 'Изумрудный', hex: '#34d399' },
  { name: 'Фиалковый', hex: '#a78bfa' }, { name: 'Янтарь (внимание)', hex: '#fbbf24' }, { name: 'Красный (просрочка/удаление)', hex: '#f87171' },
];

const DATA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => ({ d, v: [3, 5, 4, 7, 6, 9, 8][i], e: [1200, 800, 2400, 600, 1900, 3100, 900][i] }));

export default function DesignPage() {
  const toast = useToast();
  const { isDark } = useTheme();
  const [seg, setSeg] = useState('day');
  const [sw, setSw] = useState(true);
  const [ch, setCh] = useState(false);
  const [sheet, setSheet] = useState(false);
  const axis = isDark ? '#a8b5c7' : '#475569';

  return (
    <>
      <PageHeader title="Дизайн-система" subtitle="Glassy · витрина элементов" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Цвета">
          <div className="grid grid-cols-3 gap-3">
            {COLORS.map((c) => (
              <div key={c.hex} className="text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl shadow-lg" style={{ background: c.hex }} />
                <p className="mt-1.5 text-[11px] leading-tight text-muted">{c.name}</p>
              </div>
            ))}
          </div>
          <div className="grad-accent mt-4 h-10 rounded-2xl" />
        </Card>

        <Card title="Типографика">
          <p className="text-3xl font-bold tracking-tight">Заголовок <span className="grad-text">H1</span></p>
          <p className="mt-1 text-lg font-semibold">Подзаголовок</p>
          <p className="mt-1 text-[15px]">Основной текст — читаемость важнее эффекта.</p>
          <p className="mt-1 text-sm text-muted">Вторичный текст, контраст не ниже AA.</p>
        </Card>

        <Card title="Кнопки">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Plus size={18} />}>Основная</Button>
            <Button>Стекло</Button>
            <Button variant="soft">Мягкая</Button>
            <Button variant="ghost">Прозрачная</Button>
            <Button variant="danger" icon={<Trash2 size={16} />}>Удалить</Button>
            <Button size="icon" variant="soft" aria-label="Поиск"><Search size={18} /></Button>
            <Button size="sm" variant="primary">Маленькая</Button>
          </div>
        </Card>

        <Card title="Поля">
          <div className="space-y-3">
            <Field label="Название"><Input placeholder="Что сделать?" /></Field>
            <Field label="Описание"><Textarea placeholder="Детали…" /></Field>
          </div>
        </Card>

        <Card title="Переключатели">
          <Segmented value={seg} onChange={setSeg} options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip active>Сегодня</Chip><Chip>Завтра</Chip><Chip color="#a78bfa">Работа</Chip><Chip color="#34d399">Здоровье</Chip>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Switch checked={sw} onChange={setSw} label="Пример" />
            <Check checked={ch} onChange={() => setCh(!ch)} label="Пример задачи" />
            <span className="text-sm text-muted">Чекбокс с анимацией</span>
          </div>
        </Card>

        <Card title="Прогресс">
          <div className="flex items-center gap-5">
            <Ring value={72}><span className="text-xl font-bold">72%</span></Ring>
            <div className="flex-1 space-y-3">
              <div><p className="mb-1 text-sm">Продукты · 72%</p><Bar value={72} /></div>
              <div><p className="mb-1 text-sm">Кафе · сверх бюджета</p><Bar value={100} danger /></div>
            </div>
          </div>
        </Card>

        <Card title="Линейный график">
          <div className="h-40">
            <ResponsiveContainer>
              <AreaChart data={DATA} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="dsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2dd4bf" stopOpacity={0.5} /><stop offset="1" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dsLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: 'none', borderRadius: 12 }} />
                <Area type="monotone" dataKey="v" name="Задачи" stroke="url(#dsLine)" strokeWidth={3} fill="url(#dsArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Столбики">
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={DATA}>
                <defs>
                  <linearGradient id="dsBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,.1)' }} contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: 'none', borderRadius: 12 }} />
                <RBar dataKey="e" name="Расходы" fill="url(#dsBar)" radius={[8, 8, 8, 8]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Отклик">
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" icon={<Bell size={16} />} onClick={() => toast.show('Пример уведомления', { undo: true })}>Тост</Button>
            <Button variant="soft" icon={<Sparkles size={16} />} onClick={fireConfetti}>Конфетти</Button>
            <Button variant="soft" onClick={() => setSheet(true)}>Шторка</Button>
          </div>
        </Card>

        <Card title="Пустое состояние" className="md:col-span-2 xl:col-span-1">
          <Empty icon={<Heart size={26} />} title="Здесь пока пусто" hint="Подсказка, что сделать дальше." action={<Button size="sm" variant="primary">Действие</Button>} />
        </Card>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Пример шторки" footer={<Button variant="primary" className="w-full" onClick={() => setSheet(false)}>Готово</Button>}>
        <p className="text-muted">На iPhone выезжает снизу, на ноутбуке — окно по центру.</p>
      </Sheet>
    </>
  );
}
