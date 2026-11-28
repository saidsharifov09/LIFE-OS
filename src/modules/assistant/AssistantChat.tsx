// Окно помощника (отдельный чанк — грузится при первом открытии). Помощник (ИИ-чат, Этап 9): пишете обычными словами → карточка «Что я сделаю» → «Подтвердить» / «Изменить».
// Ничего не меняется без подтверждения; весь план отменяется одной кнопкой. Вопросы («что у меня завтра?»)
// отвечаются из базы на устройстве. История чата живёт, пока приложение открыто, и никуда не сохраняется.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUp, BookOpen, Bookmark, CalendarDays, CheckSquare, ChevronRight, CornerUpLeft, Droplets, History, Inbox, Pencil,
  Repeat, Settings2, Sparkles, TrendingDown, TrendingUp, Undo2, Users, X, type LucideIcon,
} from 'lucide-react';
import { lastUndo, onUndoChange, undoLast } from '@/actions';
import { cx } from '@/lib/format';
import { Sheet } from '@/ui/overlay';
import { Button, Chip } from '@/ui/primitives';
import { getAiSettings, interpret, PROVIDER_LABEL, type AiSettings } from '@/ai/cloud';
import { EDITABLE, editStep } from '@/ai/plan';
import { answerQuery, executePlan, resolvePlan, type Answer, type ResolvedStep } from '@/ai/run';

export type Status = 'pending' | 'editing' | 'done' | 'cancelled';
export type Msg =
  | { id: number; role: 'user'; text: string }
  | {
    id: number; role: 'bot'; source: string; text?: string; notice?: string; by: 'rules' | 'cloud'; provider?: string;
    items?: ResolvedStep[]; status?: Status; done?: number; undoAt?: number | null; undone?: boolean; answer?: Answer;
  };

const EXAMPLES = [
  'что у меня завтра?',
  'потратил 1200 на продукты',
  'добавь встречу с Али в пятницу в 15:00',
  'перенеси невыполненное на субботу',
  'выпил 2 стакана воды',
  'сколько я потратил за неделю?',
];

function useAiSettings(): AiSettings {
  const [s, setS] = useState(getAiSettings);
  useEffect(() => {
    const on = () => setS(getAiSettings());
    window.addEventListener('lifeos-ai-settings', on);
    return () => window.removeEventListener('lifeos-ai-settings', on);
  }, []);
  return s;
}

let msgId = 0;

export default function AssistantChat({ open, onClose, text, setText, msgs, setMsgs }: {
  open: boolean; onClose: () => void; text: string; setText: (s: string) => void;
  msgs: Msg[]; setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>;
}) {
  const navigate = useNavigate();
  const settings = useAiSettings();
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cloud = settings.level === 'cloud' && settings.consent;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs, busy]);

  const update = (id: number, patch: Partial<Extract<Msg, { role: 'bot' }>>) =>
    setMsgs((list) => list.map((m) => (m.id === id && m.role === 'bot' ? { ...m, ...patch } : m)));

  const send = async (raw = text) => {
    const t = raw.trim();
    if (!t || busy) return;
    setText('');
    // Ещё не подтверждённые планы выше считаем отменёнными — чтобы не подтвердить случайно старое
    setMsgs((list) => [...list.map((m) => (m.role === 'bot' && (m.status === 'pending' || m.status === 'editing') ? { ...m, status: 'cancelled' as const } : m)), { id: ++msgId, role: 'user', text: t }]);
    setBusy(true);
    try {
      const res = await interpret(t, settings);
      const items = res.steps.length ? await resolvePlan(res.steps) : undefined;
      const answer = res.query ? await answerQuery(res.query) : undefined;
      setMsgs((list) => [...list, {
        id: ++msgId, role: 'bot', source: t, by: res.by, provider: res.provider, notice: res.notice, text: res.reply, answer,
        items, status: items ? 'pending' : undefined,
      }]);
    } catch (e) {
      setMsgs((list) => [...list, { id: ++msgId, role: 'bot', source: t, by: 'rules', text: `Не получилось: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const go = (path: string) => { onClose(); navigate(path); };

  return (
    <Sheet open={open} onClose={onClose} wide title={<span className="inline-flex items-center gap-2"><Sparkles size={18} className="text-accent-teal" />Помощник</span>}
      footer={
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            rows={1}
            enterKeyHint="send"
            placeholder="Напишите или надиктуйте (🎙 на клавиатуре)"
            aria-label="Сообщение помощнику"
            className="field max-h-32 min-h-[44px] flex-1 resize-none py-2.5 text-[16px]"
          />
          <Button type="submit" variant="primary" size="icon" disabled={!text.trim() || busy} aria-label="Отправить"><ArrowUp size={20} /></Button>
        </form>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', cloud ? 'bg-sky-400/15 text-sky-800 dark:text-sky-200' : 'bg-[rgb(var(--line)/0.07)]')}>
          {cloud ? `Облачный ИИ · ${PROVIDER_LABEL[settings.provider]}` : 'Без ИИ · работает офлайн'}
        </span>
        <button className="focus-ring inline-flex items-center gap-1 rounded-full px-1 hover:text-fg" onClick={() => go('/settings#ai')}><Settings2 size={14} />Уровень</button>
      </div>

      {!msgs.length && (
        <div className="space-y-3 pb-2">
          <p className="text-[15px]">Пишите обычными словами — я покажу, что сделаю, и выполню только после «Подтвердить». Любое действие можно отменить.</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => <Chip key={e} onClick={() => send(e)}>{e}</Chip>)}
          </div>
          <p className="text-[13px] text-muted">Несколько команд — с новой строки (Shift+Enter) или через «;».</p>
        </div>
      )}

      <div className="space-y-3" aria-live="polite">
        {msgs.map((m) => m.role === 'user'
          ? <div key={m.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sky-400/20 px-3.5 py-2 text-[15px] text-sky-950 dark:text-sky-50">{m.text}</div>
          : <BotMessage key={m.id} m={m} update={(p) => update(m.id, p)} go={go} onRephrase={(t) => { setText(t); inputRef.current?.focus(); }} />)}
        {busy && <div className="w-fit rounded-2xl bg-[rgb(var(--line)/0.07)] px-3.5 py-2 text-[15px] text-muted">Думаю…</div>}
        <div ref={endRef} />
      </div>
    </Sheet>
  );
}

const KIND_ICON: Record<ResolvedStep['kind'], LucideIcon> = {
  task: CheckSquare, event: CalendarDays, expense: TrendingDown, income: TrendingUp, move: CornerUpLeft, note: BookOpen,
  later: Bookmark, log: History, habit: Repeat, health: Droplets, person: Users, inbox: Inbox,
};

function BotMessage({ m, update, go, onRephrase }: {
  m: Extract<Msg, { role: 'bot' }>; update: (p: Partial<Extract<Msg, { role: 'bot' }>>) => void; go: (p: string) => void; onRephrase: (t: string) => void;
}) {
  const [, force] = useState(0);
  useEffect(() => { const off = onUndoChange(() => force((n) => n + 1)); return () => { off(); }; }, []);
  const items = m.items ?? [];
  const runnable = items.filter((i) => !i.problem);
  const canUndo = m.status === 'done' && !m.undone && m.undoAt != null && lastUndo()?.at === m.undoAt;

  const confirm = async () => {
    const res = await executePlan(items, m.by === 'cloud' ? 'ИИ' : 'Помощник');
    update({ status: 'done', done: res.done, undoAt: res.undoAt });
  };
  const changeField = async (idx: number, key: string, value: string) => {
    const next = editStep(items[idx].step, key, value);
    const [r] = await resolvePlan([next]);
    update({ items: items.map((it, i) => (i === idx ? r : it)) });
  };

  return (
    <div className="max-w-[95%] space-y-2">
      {m.notice && <p className="rounded-2xl bg-amber-400/15 px-3.5 py-2 text-[13px] text-amber-900 dark:text-amber-100">{m.notice}</p>}
      {m.text && <p className="w-fit rounded-2xl rounded-bl-md bg-[rgb(var(--line)/0.07)] px-3.5 py-2 text-[15px]">{m.text}</p>}

      {m.answer && (
        <div className="glass rounded-3xl p-3">
          <p className="px-1 pb-1 font-semibold">{m.answer.title}</p>
          {!m.answer.lines.length && <p className="px-1 text-[15px] text-muted">{m.answer.empty}</p>}
          <ul>
            {m.answer.lines.map((l, i) => {
              const inner = (
                <>
                  <span className={cx('min-w-0 flex-1 truncate', l.done && 'text-muted line-through')}>{l.text}</span>
                  {l.sub && <span className="shrink-0 text-[13px] text-muted">{l.sub}</span>}
                  {l.path && <ChevronRight size={15} className="shrink-0 text-muted" />}
                </>
              );
              return (
                <li key={i}>
                  {l.path
                    ? <button onClick={() => go(l.path!)} className="focus-ring flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left text-[15px] hover:bg-[rgb(var(--line)/0.06)]">{inner}</button>
                    : <div className="flex items-center gap-2 px-1 py-1.5 text-[15px]">{inner}</div>}
                </li>
              );
            })}
          </ul>
          {m.answer.footer && <p className="px-1 pt-1 text-[13px] text-muted">{m.answer.footer}</p>}
        </div>
      )}

      {!!items.length && (
        <div className={cx('glass rounded-3xl p-3', m.status === 'cancelled' && 'opacity-60')}>
          <p className="px-1 pb-1 font-semibold">{m.status === 'done' ? (m.undone ? 'Отменено' : `Готово ✓ ${m.done ?? 0} из ${items.length}`) : m.status === 'cancelled' ? 'Не выполнено' : 'Что я сделаю'}</p>
          <ul className="space-y-1">
            {items.map((it, idx) => {
              const Icon = KIND_ICON[it.kind];
              const fields = EDITABLE[it.step.action] ?? [];
              return (
                <li key={`${idx}:${JSON.stringify(it.step)}`} className="rounded-2xl bg-[rgb(var(--line)/0.04)] px-2.5 py-2">
                  <div className="flex items-start gap-2.5">
                    <Icon size={18} className="mt-0.5 shrink-0 text-accent-teal" aria-hidden />
                    <span className={cx('flex-1 text-[15px]', it.problem && 'text-muted line-through')}>{it.text}</span>
                    {m.status === 'editing' && (
                      <button aria-label="Убрать шаг" onClick={() => update({ items: items.filter((_, i) => i !== idx) })} className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-[rgb(var(--line)/0.08)] hover:text-fg"><X size={15} /></button>
                    )}
                  </div>
                  {it.problem && <p className="ml-7 mt-1 text-[13px] text-amber-800 dark:text-amber-200">{it.problem} — шаг пропущу.</p>}
                  {m.status === 'editing' && !!fields.length && (
                    <div className="ml-7 mt-2 grid grid-cols-2 gap-2">
                      {fields.map((f) => (
                        <label key={f.key} className={cx('text-[12px] text-muted', f.type === 'text' && 'col-span-2')}>
                          {f.label}
                          <input
                            className="field mt-0.5 h-10 py-1 text-[15px]"
                            type={f.type === 'number' ? 'text' : f.type}
                            inputMode={f.type === 'number' ? 'decimal' : undefined}
                            defaultValue={String((it.step.args as Record<string, unknown>)[f.key] ?? '')}
                            onBlur={(e) => changeField(idx, f.key, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(m.status === 'pending' || m.status === 'editing') && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={!runnable.length} onClick={confirm}>Подтвердить{runnable.length > 1 ? ` (${runnable.length})` : ''}</Button>
              {m.status === 'pending'
                ? <Button variant="soft" size="sm" icon={<Pencil size={14} />} onClick={() => update({ status: 'editing' })}>Изменить</Button>
                : <Button variant="soft" size="sm" onClick={() => update({ status: 'pending' })}>Готово</Button>}
              <Button variant="ghost" size="sm" onClick={() => update({ status: 'cancelled' })}>Отмена</Button>
            </div>
          )}
          {m.status === 'cancelled' && (
            <button className="mt-2 px-1 text-[13px] text-sky-700 dark:text-sky-300" onClick={() => onRephrase(m.source)}>
              Переформулировать
            </button>
          )}
          {canUndo && (
            <Button className="mt-3" variant="soft" size="sm" icon={<Undo2 size={14} />} onClick={async () => { await undoLast(); update({ undone: true }); }}>Отменить</Button>
          )}
          {m.status === 'done' && !m.undone && !canUndo && (m.done ?? 0) > 0 && (
            <p className="mt-2 px-1 text-[12px] text-muted">После этого были другие изменения — отменяйте их в разделах.</p>
          )}
        </div>
      )}
      {m.by === 'cloud' && <p className="px-1 text-[11px] text-muted">разобрал облачный ИИ{m.provider ? ` · ${PROVIDER_LABEL[m.provider as keyof typeof PROVIDER_LABEL] ?? m.provider}` : ''}</p>}
    </div>
  );
}
