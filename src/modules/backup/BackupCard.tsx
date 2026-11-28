// Карточка «Резервная копия» в настройках: сохранить копию (по желанию с паролем) и восстановить из файла.
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudUpload, FileDown, KeyRound, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { exportAll, getSetting, importBackup, markBackupDone, type ImportMode } from '@/actions';
import {
  backupFileName, decryptBackup, encryptBackup, parseBackupFile, summarize, WrongPasswordError,
  type Backup, type EncryptedBackup,
} from '@/lib/backup';
import { today } from '@/lib/dates';
import { isMobile, shareOrDownload } from '@/lib/share';
import { Button, Card, Field, Input, Segmented, Switch } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';

export function fmtWhen(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function BackupCard() {
  const toast = useToast();
  const lastAt = useLiveQuery(() => getSetting<number | null>('lastBackupAt', null), [], null);
  const [encrypt, setEncrypt] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<{ name: string; backup?: Backup; encrypted?: EncryptedBackup } | null>(null);
  const mobile = isMobile();

  const save = async () => {
    if (encrypt) {
      if (pw.length < 6) { toast.show('Пароль — минимум 6 символов', { tone: 'error' }); return; }
      if (pw !== pw2) { toast.show('Пароли не совпадают', { tone: 'error' }); return; }
    }
    setBusy(true);
    try {
      const b = await exportAll();
      const payload = encrypt ? await encryptBackup(b, pw) : b;
      const file = new File([JSON.stringify(payload)], backupFileName(today(), encrypt), { type: 'application/json' });
      const r = await shareOrDownload(file, 'Копия Life OS');
      if (r === 'cancelled') return;
      await markBackupDone();
      toast.show(r === 'shared' ? 'Копия передана ✓ Проверьте, что файл сохранился в «Файлах»' : 'Копия скачана ✓');
    } catch (e) {
      toast.show(`Не удалось сохранить копию: ${(e as Error).message}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = parseBackupFile(await f.text());
      setRestore(parsed.kind === 'plain' ? { name: f.name, backup: parsed.backup } : { name: f.name, encrypted: parsed.encrypted });
    } catch (e) {
      toast.show((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Card title="Резервная копия" icon={<ShieldCheck size={18} />} className="lg:col-span-2">
      <p className="text-sm text-muted">
        Один файл со всеми данными. Храните его в iCloud Drive («Поделиться» → «Сохранить в Файлы»), в Telegram «Избранное» или на почте —
        и восстановите на любом устройстве.
      </p>
      <p className="mt-2 text-sm">
        {lastAt ? <>Последняя копия: <b>{fmtWhen(lastAt)}</b></> : <span className="text-amber-700 dark:text-amber-300">Копий ещё не было</span>}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Lock size={18} className="shrink-0 text-muted" />
        <div className="flex-1">
          <p className="font-medium">Зашифровать паролем</p>
          <p className="text-sm text-muted">Без пароля файл не открыть никому — даже вам.</p>
        </div>
        <Switch checked={encrypt} onChange={setEncrypt} label="Зашифровать паролем" />
      </div>
      {encrypt && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Пароль"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Пароль" /></Field>
            <Field label="Ещё раз"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-label="Повтор пароля" /></Field>
          </div>
          <p className="flex gap-2 rounded-2xl bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            Забудете пароль — копию не восстановить. Восстановить пароль невозможно: он нигде не хранится.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={<CloudUpload size={17} />} disabled={busy} onClick={save}>
          {busy ? 'Готовлю…' : mobile ? 'Сохранить копию в iCloud' : 'Скачать копию'}
        </Button>
        <Button variant="soft" icon={<FileDown size={17} />} onClick={() => fileRef.current?.click()}>Восстановить из файла</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {mobile && <p className="mt-2 text-xs text-muted">В окне «Поделиться» выберите «Сохранить в Файлы» → iCloud Drive.</p>}

      <RestoreSheet data={restore} onClose={() => setRestore(null)} onDone={(text) => toast.show(text, { undo: true })} />
    </Card>
  );
}

function RestoreSheet({ data, onClose, onDone }: {
  data: { name: string; backup?: Backup; encrypted?: EncryptedBackup } | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const toast = useToast();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [lastName, setLastName] = useState<string | null>(null);

  // Новый файл — сбросить состояние
  if (data && data.name + (data.backup?.exportedAt ?? data.encrypted?.exportedAt) !== lastName) {
    setLastName(data.name + (data.backup?.exportedAt ?? data.encrypted?.exportedAt));
    setBackup(data.backup ?? null);
    setPw(''); setMode('merge'); setConfirm(false);
  }
  const close = () => { setLastName(null); setBackup(null); onClose(); };

  const unlock = async () => {
    if (!data?.encrypted) return;
    setBusy(true);
    try {
      setBackup(await decryptBackup(data.encrypted, pw));
    } catch (e) {
      toast.show(e instanceof WrongPasswordError ? 'Неверный пароль (или файл повреждён)' : (e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!backup) return;
    if (mode === 'replace' && !confirm) { setConfirm(true); return; }
    setBusy(true);
    try {
      const r = await importBackup(backup, mode);
      close();
      onDone(mode === 'replace'
        ? `Данные заменены копией ✓ (${r.added + r.updated + r.kept} записей)`
        : `Объединено ✓ Новых: ${r.added}, обновлено: ${r.updated}`);
    } catch (e) {
      toast.show((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const summary = backup ? summarize(backup) : [];

  return (
    <Sheet open={!!data} onClose={close} title="Восстановить из копии" footer={
      backup ? (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>Отмена</Button>
          <Button variant={mode === 'replace' && confirm ? 'danger' : 'primary'} className="flex-1" disabled={busy} onClick={run}>
            {mode === 'merge' ? 'Объединить' : confirm ? 'Да, заменить всё' : 'Заменить'}
          </Button>
        </div>
      ) : (
        <Button variant="primary" className="w-full" disabled={busy || !pw} onClick={unlock}>{busy ? 'Расшифровываю…' : 'Открыть'}</Button>
      )
    }>
      {data && (
        <div className="space-y-4">
          <p className="truncate text-sm text-muted">{data.name}</p>
          {!backup && data.encrypted && (
            <>
              <p className="flex items-center gap-2"><KeyRound size={18} className="text-accent-teal" /> Копия зашифрована. Введите пароль.</p>
              <Input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && unlock()} aria-label="Пароль копии" />
            </>
          )}
          {backup && (
            <>
              <div className="rounded-2xl bg-[rgb(var(--line)/0.05)] p-3 text-sm">
                <p>Копия от <b>{backup.exportedAt ? fmtWhen(backup.exportedAt) : 'неизвестной даты'}</b></p>
                {summary.length ? (
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted">
                    {summary.map((s) => <li key={s.label} className="flex justify-between"><span>{s.label}</span><b className="tabular-nums text-fg">{s.count}</b></li>)}
                  </ul>
                ) : <p className="mt-1 text-muted">В копии нет записей.</p>}
              </div>
              <Segmented<ImportMode> value={mode} onChange={(m) => { setMode(m); setConfirm(false); }} options={[
                { value: 'merge', label: 'Объединить' },
                { value: 'replace', label: 'Заменить' },
              ]} />
              <p className="text-sm text-muted">
                {mode === 'merge'
                  ? 'Записи из копии добавятся к текущим. Если запись есть и там, и тут — останется более новая правка. Ничего не удалится.'
                  : 'Всё на этом устройстве станет ровно как в копии. Записи, которых нет в копии, будут удалены.'}
              </p>
              {mode === 'replace' && confirm && (
                <p className="flex gap-2 rounded-2xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
                  <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                  Точно заменить? Сразу после этого можно нажать «Отменить» в уведомлении. Для надёжности сначала сохраните копию текущих данных.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
