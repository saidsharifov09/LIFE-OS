// Ввод PIN: точки + крупная цифровая клавиатура (под палец на iPhone) + цифры с клавиатуры ноутбука.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { m, useAnimationControls } from 'framer-motion';
import { Delete } from 'lucide-react';
import { cx } from '@/lib/format';

interface Props {
  title: ReactNode;
  hint?: ReactNode;
  /** Известная длина PIN — проверка сразу после последней цифры. Без неё (новый PIN) — кнопка «Далее» с 4 цифр */
  length?: number;
  /** Вернуть текст ошибки (покачает точками и очистит) или null — всё хорошо */
  onSubmit: (pin: string) => Promise<string | null> | string | null;
  /** Ввод временно запрещён (пауза после ошибок) */
  disabled?: boolean;
  /** Слушать клавиатуру ноутбука (выключить, если на экране два PinPad) */
  keyboard?: boolean;
  footer?: ReactNode;
  /** Экран блокировки: перехватить ВСЕ клавиши, чтобы горячие клавиши приложения (N, /) не срабатывали под ним */
  exclusive?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({ title, hint, length, onSubmit, disabled, keyboard = true, footer, exclusive }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();
  const max = length ?? 6;
  const ref = useRef({ pin, busy, disabled });
  ref.current = { pin, busy, disabled };

  const submit = async (value: string) => {
    setBusy(true);
    const err = await onSubmit(value);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
      navigator.vibrate?.(120);
      shake.start({ x: [0, -12, 12, -8, 8, -3, 0], transition: { duration: 0.4 } });
    }
  };

  const press = (d: string) => {
    const { pin: p, busy: b, disabled: off } = ref.current;
    if (b || off || p.length >= max) return;
    const next = p + d;
    setError(null);
    setPin(next);
    if (length && next.length === length) submit(next);
  };
  const back = () => { if (!ref.current.busy) setPin((p) => p.slice(0, -1)); };

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (exclusive && e.key !== 'Tab') e.stopImmediatePropagation();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Enter' && !length && ref.current.pin.length >= 4) { e.preventDefault(); submit(ref.current.pin); }
    };
    window.addEventListener('keydown', onKey, { capture: exclusive });
    return () => window.removeEventListener('keydown', onKey, { capture: exclusive });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = length ?? Math.max(4, pin.length);

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className={cx('mt-1 min-h-[1.25rem] text-sm', error && !disabled ? 'text-red-700 dark:text-red-300' : 'text-muted')} role={error ? 'alert' : undefined} aria-live="polite">{disabled ? hint : error ?? hint}</p>
      <m.div animate={shake} className="my-6 flex gap-3.5" aria-label={`Введено цифр: ${pin.length}`} role="status">
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={cx('h-3.5 w-3.5 rounded-full border-2 transition', i < pin.length ? 'border-transparent bg-[rgb(var(--fg))]' : 'border-[rgb(var(--line)/0.35)]')} />
        ))}
      </m.div>
      <div className="grid grid-cols-3 gap-3.5" aria-disabled={disabled}>
        {KEYS.map((k) => <Key key={k} onClick={() => press(k)} disabled={disabled}>{k}</Key>)}
        {length ? <span /> : (
          <button type="button" onClick={() => submit(pin)} disabled={pin.length < 4 || busy}
            className="focus-ring h-[72px] w-[72px] rounded-full text-[15px] font-semibold text-sky-700 disabled:opacity-30 dark:text-sky-300">Далее</button>
        )}
        <Key onClick={() => press('0')} disabled={disabled}>0</Key>
        <button type="button" onClick={back} aria-label="Стереть" disabled={!pin}
          className="focus-ring grid h-[72px] w-[72px] place-items-center rounded-full text-muted transition hover:text-fg disabled:opacity-30">
          <Delete size={26} />
        </button>
      </div>
      {footer && <div className="mt-5">{footer}</div>}
    </div>
  );
}

function Key({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="focus-ring h-[72px] w-[72px] rounded-full bg-[rgb(var(--line)/0.08)] text-[28px] font-medium tabular-nums transition hover:bg-[rgb(var(--line)/0.13)] active:scale-90 active:bg-[rgb(var(--line)/0.2)] disabled:opacity-40">
      {children}
    </button>
  );
}
