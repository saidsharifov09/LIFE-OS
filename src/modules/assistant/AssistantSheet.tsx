// Помощник (ИИ-чат, Этап 9): кнопка ✨ рядом с быстрой записью, горячая клавиша A на ноутбуке.
// Здесь — только лёгкая оболочка; само окно (разбор фраз, план, ответы) догружается отдельным чанком при первом открытии.
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Msg } from './AssistantChat';

const loadChat = () => import('./AssistantChat');
const AssistantChat = lazy(loadChat);

interface AssistantApi { open: (prefill?: string) => void }
const Ctx = createContext<AssistantApi>({ open: () => {} });
export const useAssistant = () => useContext(Ctx);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // Раз открыв, держим окно смонтированным — чтобы шторка красиво закрывалась
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (isOpen) setLoaded(true); }, [isOpen]);
  // Догрузить окно заранее, когда приложение уже открылось, — чтобы на iPhone клавиатура открывалась с первого касания
  useEffect(() => { const t = setTimeout(() => { loadChat().catch(() => {}); }, 4000); return () => clearTimeout(t); }, []);
  const open = useCallback((prefill = '') => {
    flushSync(() => { if (prefill) setText(prefill); setOpen(true); });
  }, []);

  // Горячая клавиша на ноутбуке: A (Ф) — если курсор не в поле ввода
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'a' || e.key === 'ф') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {(isOpen || loaded) && (
        <Suspense fallback={null}>
          <AssistantChat open={isOpen} onClose={() => setOpen(false)} text={text} setText={setText} msgs={msgs} setMsgs={setMsgs} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}

