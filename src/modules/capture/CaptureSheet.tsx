// Быстрый захват: открыл → написал → Enter. Запись попадает во «Входящие».
// Подсказки (дата, время, сумма) только показываются — ничего не применяется без вашего действия.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CheckSquare, Clock, Inbox, Wallet, CornerDownLeft } from 'lucide-react';
import { capture, processInbox } from '@/actions';
import { parseCapture } from '@/lib/parse';
import { fmtRelative } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { Sheet, useToast } from '@/ui/overlay';
import { Button, Chip } from '@/ui/primitives';

interface CaptureApi { open: (prefill?: string) => void }
const Ctx = createContext<CaptureApi>({ open: () => {} });
export const useCapture = () => useContext(Ctx);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [text, setText] = useState('');
  const open = useCallback((prefill = '') => {
    // flushSync — чтобы фокус и клавиатура iPhone открылись в том же касании
    flushSync(() => { setText(prefill); setOpen(true); });
  }, []);

  // Горячая клавиша на ноутбуке: N или «+» (если курсор не в поле ввода)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'т' || e.key === '+') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <CaptureSheet open={isOpen} onClose={() => setOpen(false)} text={text} setText={setText} />
    </Ctx.Provider>
  );
}

function CaptureSheet({ open, onClose, text, setText }: { open: boolean; onClose: () => void; text: string; setText: (s: string) => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hints = useMemo(() => parseCapture(text), [text]);
  const trimmed = text.trim();

  const save = async (as?: 'task' | 'expense' | 'income') => {
    if (!trimmed) return;
    const item = await capture(trimmed);
    setText('');
    onClose();
    if (as) {
      await processInbox(item.id, as);
      toast.show(as === 'task' ? 'Задача добавлена ✓' : as === 'income' ? 'Доход записан ✓' : 'Расход записан ✓', { undo: true });
    } else {
      toast.show('Во входящих ✓', { action: { label: 'Разобрать', onClick: () => navigate('/inbox') } });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Быстрая запись">
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <textarea
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
          }}
          rows={2}
          enterKeyHint="done"
          placeholder="Что в голове? Например: «позвонить маме завтра в 18:00» или «кофе 250»"
          aria-label="Текст записи"
          className="field min-h-[72px] resize-none text-[17px]"
        />
        {/* Подсказки распознавания */}
        <div className="mt-3 flex min-h-8 flex-wrap gap-2">
          {hints.date && <Chip icon={<CalendarDays size={14} />}>{fmtRelative(hints.date)}</Chip>}
          {hints.time && <Chip icon={<Clock size={14} />}>{hints.time}</Chip>}
          {hints.amount && (
            <Chip icon={<Wallet size={14} />}>
              {fmtMoney(hints.amount, hints.currency ?? 'RUB')} · {hints.moneyKind === 'income' ? 'доход?' : 'расход?'}
            </Chip>
          )}
          {!hints.date && !hints.time && !hints.amount && (
            <span className="text-[13px] text-muted">Enter — сохранить во «Входящие». Разберёте потом в один тап.</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={!trimmed} icon={<Inbox size={18} />} className="flex-1">
            Во входящие <CornerDownLeft size={15} className="opacity-60" />
          </Button>
          <Button disabled={!trimmed} onClick={() => save('task')} icon={<CheckSquare size={18} />} variant="soft">
            Задача
          </Button>
          {hints.amount && (
            <Button onClick={() => save(hints.moneyKind === 'income' ? 'income' : 'expense')} icon={<Wallet size={18} />} variant="soft">
              {hints.moneyKind === 'income' ? 'Доход' : 'Расход'}
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
