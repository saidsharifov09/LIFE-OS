// Настройки финансов: курсы валют, счёт по умолчанию, архив счетов, импорт/экспорт CSV.
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, Coins, Download, FileUp, Upload } from 'lucide-react';
import { getSetting, importTransactions, setSetting, updateAccount } from '@/actions';
import { fromCSV, toCSV, type ImportedTx } from '@/lib/finance';
import { today } from '@/lib/dates';
import { shareOrDownload } from '@/lib/share';
import { fmtMoney, plural } from '@/lib/format';
import { Button, Card, Chip } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { type FinanceData } from './shared';
import { RatesCard } from './RatesCard';

export function FinanceSettings({ data }: { data: FinanceData }) {
  const toast = useToast();
  const defaultAcc = useLiveQuery(() => getSetting<string | null>('defaultAccount', null), [], null);
  const archived = data.allAccounts.filter((a) => a.archived);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ items: ImportedTx[]; skipped: number; name: string } | null>(null);

  const exportCSV = async () => {
    const csv = toCSV(data.txs, data.allAccounts);
    const name = `life-os-operacii-${today()}.csv`;
    const r = await shareOrDownload(new File([csv], name, { type: 'text/csv' }));
    if (r === 'cancelled') return;
    toast.show(`Экспортировано: ${data.txs.length} ${plural(data.txs.length, ['операция', 'операции', 'операций'])}`);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const res = fromCSV(text);
    if (!res.items.length) { toast.show('Не нашёл операций. Нужны столбцы «Дата» и «Сумма».', { tone: 'error' }); return; }
    setPreview({ ...res, name: f.name });
  };

  const doImport = async () => {
    if (!preview) return;
    const r = await importTransactions(preview.items);
    setPreview(null);
    toast.show(`Добавлено: ${r.added}${r.dup ? `, пропущено дублей: ${r.dup}` : ''}`, { undo: true });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <RatesCard />

      <Card title="Счёт по умолчанию" icon={<Coins size={18} />}>
        <p className="mb-3 text-sm text-muted">Сюда записываются расходы из быстрого захвата («кофе 250»).</p>
        <div className="flex flex-wrap gap-1.5">
          {data.accounts.length === 0 && <p className="text-sm text-muted">Счетов пока нет.</p>}
          {data.accounts.map((a, i) => (
            <Chip key={a.id} active={defaultAcc ? defaultAcc === a.id : i === 0} onClick={async () => { await setSetting('defaultAccount', a.id); toast.show(`По умолчанию: ${a.name}`); }}>{a.name}</Chip>
          ))}
        </div>
      </Card>

      <Card title="Импорт и экспорт CSV" icon={<FileUp size={18} />} className="lg:col-span-2">
        <p className="text-sm text-muted">
          Экспорт — файл для Excel/Google Таблиц (разделитель «;»). Импорт понимает этот же формат и простые выписки:
          столбцы «Дата» и «Сумма» обязательны, «Тип», «Категория», «Счёт», «Комментарий» — по желанию. Минус в сумме = расход. Дубли пропускаются.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="soft" icon={<Download size={15} />} onClick={exportCSV} disabled={!data.txs.length}>Экспорт CSV</Button>
          <Button size="sm" variant="soft" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>Импорт CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {preview && (
          <div className="mt-4 rounded-2xl bg-[rgb(var(--line)/0.05)] p-3">
            <p className="text-sm">
              <b>{preview.name}</b>: найдено {preview.items.length} {plural(preview.items.length, ['операция', 'операции', 'операций'])}
              {preview.skipped ? `, не распознано строк: ${preview.skipped}` : ''}.
            </p>
            <ul className="mt-2 space-y-0.5 text-sm text-muted">
              {preview.items.slice(0, 4).map((it, i) => (
                <li key={i} className="truncate">{it.date} · {it.type === 'income' ? 'доход' : it.type === 'transfer' ? 'перевод' : 'расход'} {fmtMoney(it.amount, it.currency)}{it.note ? ` · ${it.note}` : ''}</li>
              ))}
              {preview.items.length > 4 && <li>…</li>}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" onClick={doImport}>Импортировать</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Отмена</Button>
            </div>
          </div>
        )}
      </Card>

      {archived.length > 0 && (
        <Card title="Архив счетов" icon={<Archive size={18} />}>
          <ul className="space-y-2">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <span className="flex-1">{a.name} <span className="text-sm text-muted">{fmtMoney(data.balances.get(a.id) ?? 0, a.currency)}</span></span>
                <Button size="sm" variant="soft" onClick={() => updateAccount(a.id, { archived: false })}>Вернуть</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted lg:col-span-2">Банковских интеграций нет — всё вводится вручную или из CSV. Данные хранятся на этом устройстве.</p>
    </div>
  );
}
