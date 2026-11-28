// Настройки облака: подключение Supabase → вход по коду из письма → пароль шифрования → статус.
import { useEffect, useState } from 'react';
import { Cloud, KeyRound, LogOut, Mail, RefreshCw, Server, TriangleAlert } from 'lucide-react';
import { getConfig, getSession, normalizeUrl, setConfig, SupabaseApi } from '@/sync/api';
import { resetSyncState, unlock, WrongSyncPassword } from '@/sync/engine';
import { api, refreshStatus, syncNow, useSyncState } from '@/sync/auto';
import { Button, Card, Field, Input } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { SyncBadge } from './SyncBadge';

export const GUIDE_URL = 'https://github.com/saidsharifov09/LIFE-OS/blob/main/docs/SUPABASE.md';

export function SyncCard() {
  const st = useSyncState();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  useEffect(() => { void refreshStatus(); }, []);
  const cfg = getConfig();
  const session = getSession();

  return (
    <Card title="Облако и синхронизация" icon={<Cloud size={18} />} action={cfg && session ? <SyncBadge /> : undefined} className="lg:col-span-2">
      {!cfg ? <ConnectStep onDone={rerender} />
        : !session ? <LoginStep onDone={rerender} onChangeServer={() => { setConfig(null); rerender(); }} />
        : st.status === 'locked' ? <PasswordStep onDone={rerender} />
        : <ReadyStep onChange={rerender} />}
      {st.error && st.status !== 'error' && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{st.error}</p>}
    </Card>
  );
}

function ConnectStep({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const save = () => {
    const u = normalizeUrl(url);
    // https обязателен; http — только для локальной проверки
    if (!/^https:\/\/[^/]+$/.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { toast.show('Адрес должен быть вида https://xxxx.supabase.co', { tone: 'error' }); return; }
    if (key.trim().length < 20) { toast.show('Вставьте публичный ключ целиком', { tone: 'error' }); return; }
    setConfig({ url: u, anonKey: key.trim() });
    onDone();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Данные будут синхронизироваться между iPhone и ноутбуком через ваш бесплатный проект Supabase.
        Всё шифруется на устройстве <b>до отправки</b> — в облаке лежит только шифр.
      </p>
      <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-sky-700 dark:text-sky-300">Пошаговая инструкция: как создать проект с iPhone (5 минут) →</a>
      <Field label="Адрес проекта (Project URL)"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></Field>
      <Field label="Публичный ключ (anon / publishable)"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi… или sb_publishable_…" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></Field>
      <p className="text-xs text-muted">Ключ публичный — его безопасно хранить на устройстве; данные защищает вход по email и правила доступа (RLS). Хранится только на этом устройстве.</p>
      <Button variant="primary" icon={<Server size={16} />} onClick={save}>Подключить</Button>
    </div>
  );
}

function LoginStep({ onDone, onChangeServer }: { onDone: () => void; onChangeServer: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const a = new SupabaseApi(getConfig()!);

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.show('Введите email', { tone: 'error' }); return; }
    setBusy(true);
    try {
      await a.sendCode(email.trim(), `${location.origin}${location.pathname}`);
      setSent(true);
      toast.show('Письмо отправлено — проверьте почту');
    } catch (e) {
      toast.show((e as Error).message, { tone: 'error' });
    } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    try {
      await a.verifyCode(email.trim(), code);
      await refreshStatus();
      onDone();
    } catch (e) {
      toast.show((e as Error).message, { tone: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Вход без пароля: на почту придёт письмо с кодом. Используйте один и тот же email на iPhone и ноутбуке.</p>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="off" disabled={sent} /></Field>
      {!sent ? (
        <Button variant="primary" icon={<Mail size={16} />} disabled={busy} onClick={send}>{busy ? 'Отправляю…' : 'Получить код'}</Button>
      ) : (
        <>
          <Field label="Код или ссылка из письма"><Input value={code} onChange={(e) => setCode(e.target.value.trim())} autoComplete="one-time-code" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="123456 или https://…" onKeyDown={(e) => e.key === 'Enter' && code && verify()} autoFocus /></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy || code.length < 6} onClick={verify}>{busy ? 'Проверяю…' : 'Войти'}</Button>
            <Button variant="ghost" onClick={() => { setSent(false); setCode(''); }}>Другой email</Button>
          </div>
          <p className="text-xs text-muted">В письме только ссылка «Sign in» / «Confirm your mail»? Не нажимайте её — <b>удерживайте палец</b> на ней → «Скопировать ссылку» → вставьте сюда.</p>
        </>
      )}
      <button className="text-xs text-muted underline" onClick={onChangeServer}>Изменить адрес проекта</button>
    </div>
  );
}

function PasswordStep({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api()?.getVault().then((v) => setHasVault(!!v)).catch((e) => { toast.show((e as Error).message, { tone: 'error' }); setHasVault(null); });
  }, [toast]);

  const go = async () => {
    if (!hasVault) {
      if (pw.length < 8) { toast.show('Пароль — минимум 8 символов', { tone: 'error' }); return; }
      if (pw !== pw2) { toast.show('Пароли не совпадают', { tone: 'error' }); return; }
    }
    setBusy(true);
    try {
      const r = await unlock(api()!, pw);
      await refreshStatus();
      onDone();
      toast.show(r === 'created' ? 'Облако готово — отправляю данные' : 'Пароль верный — загружаю данные');
      await syncNow();
    } catch (e) {
      toast.show(e instanceof WrongSyncPassword ? 'Неверный пароль синхронизации' : (e as Error).message, { tone: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm">Вход выполнен: <b>{getSession()?.user.email}</b></p>
      {hasVault === null ? <p className="text-sm text-muted">Проверяю облако…</p> : hasVault ? (
        <p className="flex items-center gap-2 text-sm"><KeyRound size={16} className="text-accent-teal" /> Введите пароль синхронизации, который вы задали на другом устройстве.</p>
      ) : (
        <p className="flex items-center gap-2 text-sm"><KeyRound size={16} className="text-accent-teal" /> Придумайте пароль шифрования. Его нужно будет ввести один раз на каждом устройстве.</p>
      )}
      <Field label="Пароль синхронизации"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={hasVault ? 'current-password' : 'new-password'} onKeyDown={(e) => e.key === 'Enter' && hasVault && pw && go()} /></Field>
      {hasVault === false && <Field label="Ещё раз"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>}
      {hasVault === false && (
        <p className="flex gap-2 rounded-2xl bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          Забудете пароль — данные в облаке не восстановить: даже Supabase не сможет их прочитать. Данные на устройствах останутся.
        </p>
      )}
      <Button variant="primary" disabled={busy || !pw || hasVault === null} onClick={go}>{busy ? 'Проверяю…' : hasVault ? 'Открыть' : 'Включить синхронизацию'}</Button>
      {hasVault && <ForgotPassword onDone={() => setHasVault(false)} />}
    </div>
  );
}

function ForgotPassword({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="block text-xs text-muted underline" onClick={() => setAsk(true)}>Забыли пароль?</button>;
  return (
    <div className="rounded-2xl bg-red-500/10 p-3 text-sm">
      <p className="text-red-700 dark:text-red-200">Пароль восстановить нельзя. Можно очистить облако и задать новый пароль — тогда в облако загрузятся данные с этого устройства, а на других устройствах нужно будет ввести новый пароль.</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="danger" onClick={async () => {
          try { await api()!.wipe(); await resetSyncState(); onDone(); toast.show('Облако очищено. Задайте новый пароль.'); }
          catch (e) { toast.show((e as Error).message, { tone: 'error' }); }
        }}>Очистить облако</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>Отмена</Button>
      </div>
    </div>
  );
}

function ReadyStep({ onChange }: { onChange: () => void }) {
  const st = useSyncState();
  const toast = useToast();
  return (
    <div className="space-y-3">
      <p className="text-sm">Аккаунт: <b>{getSession()?.user.email}</b></p>
      <p className="text-sm text-muted">
        {st.lastSyncAt ? `Последняя синхронизация: ${new Date(st.lastSyncAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Ещё не синхронизировалось'}
        {st.last && (st.last.pulled || st.last.pushed) ? ` · получено ${st.last.pulled}, отправлено ${st.last.pushed}` : ''}
      </p>
      {st.status === 'error' && <p className="text-sm text-red-700 dark:text-red-300">Ошибка: {st.error}</p>}
      <p className="text-xs text-muted">Синхронизация идёт сама: при запуске, через пару секунд после изменений и раз в минуту. При конфликте побеждает более новая правка.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" icon={<RefreshCw size={16} className={st.status === 'syncing' ? 'animate-spin' : ''} />} disabled={st.status === 'syncing'} onClick={() => syncNow()}>Синхронизировать сейчас</Button>
        <Button variant="ghost" icon={<LogOut size={16} />} onClick={async () => {
          if (!confirm('Выйти из облака на этом устройстве? Данные на устройстве останутся.')) return;
          await api()?.signOut();
          await resetSyncState();
          await refreshStatus();
          onChange();
          toast.show('Вы вышли из облака');
        }}>Выйти</Button>
      </div>
    </div>
  );
}
