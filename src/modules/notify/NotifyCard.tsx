// Настройки → Уведомления: напоминания внутри приложения + push при закрытом приложении (через ваш Supabase).
import { useEffect, useState } from 'react';
import { Bell, BellOff, Copy, ExternalLink, Send } from 'lucide-react';
import { Button, Card, Switch } from '@/ui/primitives';
import { useToast } from '@/ui/overlay';
import { functionCode, functionReady, FunctionError, pushSql } from '@/sync/functions';
import { disablePush, enablePush, getPushSettings, hasSubscription, pushSupport, savePushSettings, syncPush, testPush, type PushSettings } from './push';

const GUIDE = 'https://github.com/saidsharifov09/LIFE-OS/blob/main/docs/SETUP-IPHONE.md';

const FN_TEXT: Record<string, string> = {
  'not-configured': 'Сначала подключите облако (карточка «Облако» выше).',
  'not-signed-in': 'Войдите в облако (карточка «Облако» выше).',
  offline: 'Нет сети.',
  'no-function': 'В Supabase нет функции life-os — шаг 2 инструкции.',
  setup: 'Нет таблиц уведомлений — выполните SQL (шаг 4 инструкции).',
  forbidden: 'Функция не пустила этот вход (ALLOWED_EMAILS).',
};
const errText = (e: unknown) => (e instanceof FunctionError ? FN_TEXT[e.reason] ?? e.message : (e as Error).message);

function fmtAgo(ts?: number) {
  if (!ts) return 'ещё не отправлялось';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`;
}

export function NotifyCard() {
  const toast = useToast();
  const [s, setS] = useState<PushSettings>(getPushSettings);
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const support = pushSupport();
  const ready = functionReady();

  useEffect(() => {
    const on = () => setS(getPushSettings());
    window.addEventListener('lifeos-push', on);
    void hasSubscription().then(setSubscribed);
    return () => window.removeEventListener('lifeos-push', on);
  }, []);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.show(ok); } catch (e) { toast.show(errText(e), { tone: 'error' }); } finally {
      setBusy(false);
      setS(getPushSettings());
      setPerm('Notification' in window ? Notification.permission : 'unsupported');
      void hasSubscription().then(setSubscribed);
    }
  };

  const copy = async (what: 'sql' | 'code') => {
    try {
      const text = what === 'sql' ? await pushSql() : await functionCode();
      if (!text) { toast.show('Сначала подключите облако — в SQL нужен адрес вашего проекта', { tone: 'error' }); return; }
      await navigator.clipboard.writeText(text);
      toast.show(what === 'sql' ? 'SQL скопирован — вставьте в Supabase → SQL Editor → Run' : 'Код функции скопирован — вставьте в редактор функции life-os');
    } catch {
      toast.show('Не удалось скопировать', { tone: 'error' });
    }
  };

  return (
    <Card title="Уведомления" icon={<Bell size={18} />}>
      <p className="text-sm text-muted">
        Пока приложение открыто, напоминания о событиях и задачах со временем показываются сами.
        Чтобы они приходили и <b className="font-medium text-fg">при закрытом приложении</b>, нужен ваш Supabase (облако) — один раз настроить по инструкции.
      </p>

      {support === 'install' && (
        <p className="mt-3 rounded-2xl bg-amber-400/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          На iPhone уведомления работают только у приложения с экрана «Домой»: в Safari «Поделиться» → «На экран „Домой“», затем откройте Life OS оттуда и включите здесь.
        </p>
      )}
      {support === 'unsupported' && <p className="mt-3 text-sm text-muted">Этот браузер не поддерживает push-уведомления.</p>}

      {support === 'ok' && (
        <div className="mt-3 space-y-3 text-sm">
          {s.enabled ? (
            <>
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                Уведомления включены{subscribed === false ? ' (на этом устройстве подписки нет — нажмите «Включить заново»)' : ' ✓'}
              </p>
              <p className="text-muted">
                Расписание на 14 дней отправлено: {fmtAgo(s.lastSyncAt)}{s.lastCount !== undefined ? ` · напоминаний: ${s.lastCount}` : ''}.
                {s.lastError && <span className="text-amber-800 dark:text-amber-200"> Последняя ошибка: {s.lastError}</span>}
              </p>
              <div className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 py-2.5">
                <div className="flex-1">
                  <p className="font-medium">Показывать названия дел</p>
                  <p className="text-muted">Выключено: «⏰ Задача на 15:00». Включено: «Позвонить маме» — но тогда названия хранятся в Supabase без шифрования.</p>
                </div>
                <Switch checked={s.showTitles} onChange={(v) => { savePushSettings({ showTitles: v }); void run(() => syncPush(true)); }} label="Показывать названия дел" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" icon={<Send size={14} />} disabled={busy} onClick={() => run(async () => {
                  const n = await testPush();
                  if (!n) throw new Error('Не дошло ни до одного устройства — нажмите «Включить заново»');
                }, 'Тест отправлен — уведомление придёт через пару секунд')}>Прислать тест</Button>
                <Button size="sm" variant="soft" disabled={busy} onClick={() => run(enablePush, 'Уведомления включены ✓')}>Включить заново</Button>
                <Button size="sm" variant="ghost" icon={<BellOff size={14} />} disabled={busy} onClick={() => run(disablePush, 'Уведомления выключены')}>Выключить</Button>
              </div>
            </>
          ) : (
            <>
              {ready && <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-amber-900 dark:text-amber-100">{FN_TEXT[ready]}</p>}
              <Button size="sm" variant="primary" icon={<Bell size={15} />} disabled={busy || !!ready} onClick={() => run(enablePush, 'Уведомления включены ✓ Нажмите «Прислать тест»')}>
                {busy ? 'Включаю…' : 'Включить уведомления'}
              </Button>
              {perm === 'denied' && <p className="text-amber-800 dark:text-amber-200">Уведомления запрещены в настройках устройства. iPhone: Настройки → Уведомления → Life OS.</p>}
            </>
          )}
        </div>
      )}

      {support !== 'ok' && perm !== 'unsupported' && perm !== 'granted' && (
        <Button className="mt-3" size="sm" variant="soft" onClick={async () => setPerm(await Notification.requestPermission())}>Разрешить уведомления, пока приложение открыто</Button>
      )}

      <div className="mt-4 border-t border-[rgb(var(--line)/0.08)] pt-3">
        <p className="mb-2 text-sm text-muted">Настройка в Supabase (один раз):</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="soft" icon={<Copy size={14} />} onClick={() => copy('code')}>Код функции</Button>
          <Button size="sm" variant="soft" icon={<Copy size={14} />} onClick={() => copy('sql')}>SQL для уведомлений</Button>
        </div>
        <a href={GUIDE} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-sky-700 dark:text-sky-300">
          Пошаговая инструкция с iPhone <ExternalLink size={13} />
        </a>
        <p className="mt-2 text-xs text-muted">Для самого важного (платежи, дни рождения) надёжнее кнопка «В Календарь iPhone» в карточке дела.</p>
      </div>
    </Card>
  );
}
