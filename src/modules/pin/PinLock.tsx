// Блокировка приложения PIN-кодом. Честно: защита от посторонних глаз, а не шифрование (см. src/lib/pin.ts).
// Когда блокировать: при запуске и после N минут в фоне (0 — сразу при сворачивании).
// Приложение под экраном блокировки не размонтируется (недописанное не теряется), но закрыто непрозрачным слоем
// и недоступно для нажатий и экранного диктора (inert).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { getFails, getPinConfig, hasPin, verifyPin } from '@/lib/pin';
import { plural } from '@/lib/format';
import { Button } from '@/ui/primitives';
import { PinPad } from './PinPad';

interface LockApi {
  enabled: boolean;
  /** Заблокировать сейчас */
  lock: () => void;
  /** Перечитать настройки PIN (после включения/выключения в настройках) */
  refresh: () => void;
}
const Ctx = createContext<LockApi>({ enabled: false, lock: () => {}, refresh: () => {} });
export const usePinLock = () => useContext(Ctx);

export function PinLockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(hasPin);
  // Блокировка с первого кадра — без «вспышки» данных при запуске
  const [locked, setLocked] = useState(hasPin);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVis = () => {
      const cfg = getPinConfig();
      if (!cfg) return;
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        // «Сразу» — закрываем ещё при сворачивании, чтобы в переключателе приложений не было видно данных
        if (cfg.lockAfter === 0) setLocked(true);
      } else if (hiddenAt.current !== null) {
        if (Date.now() - hiddenAt.current >= cfg.lockAfter * 60_000) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Пока заблокировано — содержимое приложения недоступно (клавиатура, диктор, нажатия)
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    if (locked) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
    // Открытые шторки живут в document.body — их тоже закрываем от нажатий
    document.querySelectorAll('body > :not(#root):not([data-pin-lock]):not(script)').forEach((el) => {
      if (locked) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }, [locked]);

  const lock = useCallback(() => { if (hasPin()) setLocked(true); }, []);
  const refresh = useCallback(() => { setEnabled(hasPin()); if (!hasPin()) setLocked(false); }, []);

  return (
    <Ctx.Provider value={{ enabled, lock, refresh }}>
      {children}
      {locked && createPortal(<LockScreen onUnlock={() => setLocked(false)} />, document.body)}
    </Ctx.Provider>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const cfg = getPinConfig();
  const [wait, setWait] = useState(() => Math.max(0, getFails().until - Date.now()));
  const [forgot, setForgot] = useState(false);

  // Обратный отсчёт паузы после неверных попыток
  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait(Math.max(0, getFails().until - Date.now())), 500);
    return () => clearInterval(id);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Блокировка поверх всего: прокрутку страницы под ней отключаем
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // PIN выключили на другой вкладке — блокировать нечего
  useEffect(() => { if (!cfg) onUnlock(); }, [cfg, onUnlock]);
  if (!cfg) return null;
  const secs = Math.ceil(wait / 1000);

  return (
    <div data-pin-lock className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto px-6 py-10" role="dialog" aria-modal="true" aria-label="Приложение заблокировано">
      <div className="app-bg !z-0"><i /></div>
      <div className="relative flex flex-col items-center">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[rgb(var(--line)/0.08)] text-accent-teal"><Lock size={26} /></div>
        {forgot ? <Forgot onBack={() => setForgot(false)} /> : (
        <PinPad
          length={cfg.length}
          title="Введите PIN"
          hint={wait > 0 ? `Слишком много попыток. Подождите ${secs} ${plural(secs, ['секунду', 'секунды', 'секунд'])}` : 'Life OS'}
          disabled={wait > 0}
          exclusive
          onSubmit={async (pin) => {
            const r = await verifyPin(pin);
            if (r.ok) { onUnlock(); return null; }
            if (r.waitMs > 0) { setWait(r.waitMs); return 'Неверный PIN'; }
            return r.left <= 2 ? `Неверный PIN. Ещё ${r.left} ${plural(r.left, ['попытка', 'попытки', 'попыток'])} до паузы` : 'Неверный PIN';
          }}
          footer={<button className="text-sm text-muted hover:text-fg" onClick={() => setForgot(true)}>Забыли PIN?</button>}
        />
        )}
      </div>
    </div>
  );
}

/**
 * «Забыли PIN?» — честно: PIN нигде не хранится в открытом виде, восстановить его нельзя.
 * Можно сбросить это устройство: удалить локальные данные и PIN. Из облака (если была синхронизация)
 * или из файла копии всё вернётся. Иначе PIN был бы бесполезен — его снимал бы любой.
 */
function Forgot({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    const { db } = await import('@/db/db');
    db.close();
    await db.delete();
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ }
    location.reload();
  };
  return (
    <div className="glass-strong w-full max-w-md rounded-4xl p-5 text-left">
      <h2 className="mb-3 text-lg font-semibold">Забыли PIN?</h2>
      <div className="space-y-3 text-[15px]">
        <p>PIN хранится только в виде хеша — подсмотреть или восстановить его нельзя.</p>
        <p>Можно <b>сбросить это устройство</b>: удалятся PIN и все данные Life OS <b>на этом устройстве</b>, приложение станет как новое.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Была синхронизация — войдите в облако заново (адрес, ключ, email и пароль шифрования), данные вернутся.</li>
          <li>Есть файл резервной копии — восстановите его в «Настройках».</li>
          <li>Нет ни облака, ни копии — данные этого устройства пропадут навсегда.</li>
        </ul>
        {step === 0 ? (
          <div className="flex gap-2 pt-1">
            <Button variant="soft" className="flex-1" onClick={onBack}>Назад к PIN</Button>
            <Button variant="danger" className="flex-1" onClick={() => setStep(1)}>Сбросить…</Button>
          </div>
        ) : (
          <div className="rounded-2xl bg-red-500/10 p-3">
            <p className="mb-3 text-sm font-medium">Точно удалить все данные на этом устройстве? Отменить будет нельзя.</p>
            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => setStep(0)}>Нет</Button>
              <Button variant="danger" className="flex-1" disabled={busy} onClick={reset}>Да, сбросить</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
