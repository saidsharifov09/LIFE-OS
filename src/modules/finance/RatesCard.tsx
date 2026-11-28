// Курсы валют к рублю (вручную). Один компонент — в «Финансы → Настройки» и в общих «Настройках».
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Coins } from 'lucide-react';
import { getRates, setRates } from '@/actions';
import type { Rates } from '@/lib/finance';
import { Button, Card, Input, Label } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { parseNum } from './shared';

export function RatesCard({ className }: { className?: string }) {
  const rates = useLiveQuery(() => getRates(), []);
  return (
    <Card title="Валюты и курсы" icon={<Coins size={18} />} className={className}>
      <p className="mb-3 text-sm text-muted">Основная валюта — рубль (₽). Курсы сомони и доллара задаются вручную; по ним считаются итоги, бюджеты и графики.</p>
      {rates ? <RatesForm key={`${rates.USD}_${rates.TJS}`} rates={rates} /> : <div className="h-24" />}
    </Card>
  );
}

function RatesForm({ rates }: { rates: Rates }) {
  const toast = useToast();
  const [usd, setUsd] = useState(String(rates.USD).replace('.', ','));
  const [tjs, setTjs] = useState(String(rates.TJS).replace('.', ','));
  const save = async () => {
    const u = parseNum(usd), t = parseNum(tjs);
    if (u <= 0 || t <= 0) { toast.show('Курс должен быть больше нуля', { tone: 'error' }); return; }
    await setRates({ USD: u, TJS: t });
    toast.show('Курсы сохранены');
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label><Label>1 $ = … ₽</Label><Input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} aria-label="Курс доллара" /></label>
        <label><Label>1 смн = … ₽</Label><Input inputMode="decimal" value={tjs} onChange={(e) => setTjs(e.target.value)} aria-label="Курс сомони" /></label>
      </div>
      <Button className="mt-3" size="sm" variant="primary" onClick={save}>Сохранить курсы</Button>
    </>
  );
}
