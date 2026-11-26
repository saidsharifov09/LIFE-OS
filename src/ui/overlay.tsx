// Всплывающие слои: нижняя шторка (на ноутбуке — модальное окно) и тосты с «Отменить».
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cx } from '@/lib/format';
import { undoLast } from '@/actions';

// ---------- Шторка ----------
export function Sheet({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1, pointerEvents: 'none', transition: { duration: 0.25 } }}
        >
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={cx('glass-strong relative flex max-h-[92dvh] w-full flex-col rounded-t-4xl sm:rounded-4xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[rgb(var(--line)/0.2)] sm:hidden" />
            {title !== undefined && (
              <div className="flex items-center gap-2 px-5 pb-2 pt-3 sm:pt-5">
                <h2 className="flex-1 text-lg font-semibold">{title}</h2>
                <button onClick={onClose} className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-[rgb(var(--line)/0.07)] text-muted hover:text-fg" aria-label="Закрыть">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="hairline border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
            {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- Тосты ----------
interface Toast { id: number; text: string; undo?: boolean; tone?: 'ok' | 'error' | 'info'; action?: { label: string; onClick: () => void } }
interface ToastApi { show: (text: string, opts?: Omit<Toast, 'id' | 'text'>) => void }
const ToastCtx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>((text, opts) => {
    const id = ++counter.current;
    setToasts((t) => [...t.slice(-2), { id, text, ...opts }]);
    setTimeout(() => remove(id), opts?.undo || opts?.action ? 5000 : 2600);
  }, [remove]);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ y: -20, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0, scale: 0.96 }}
                className={cx('glass-strong pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm', t.tone === 'error' && 'ring-1 ring-red-400/60')}
              >
                <span className="flex-1">{t.text}</span>
                {t.action && (
                  <button className="font-semibold text-sky-600 dark:text-sky-300" onClick={() => { t.action!.onClick(); remove(t.id); }}>{t.action.label}</button>
                )}
                {t.undo && (
                  <button
                    className="font-semibold text-sky-600 dark:text-sky-300"
                    onClick={async () => { remove(t.id); const l = await undoLast(); if (l) show(`Отменено: ${l.toLowerCase()}`); }}
                  >
                    Отменить
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
