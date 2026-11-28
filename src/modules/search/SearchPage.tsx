// «Поиск» по всему приложению: задачи, события, заметки, люди, «позже», цели, привычки, история, деньги.
// Запрос хранится в адресе (?q=…) — «Назад» из найденной записи возвращает к тем же результатам.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight, Bookmark, CalendarDays, CheckSquare, Clock, Flame, History, Inbox, Landmark, NotebookPen,
  PiggyBank, Receipt, Repeat, Search, Target, Users, HandCoins, X, type LucideIcon,
} from 'lucide-react';
import { groupHits, searchAll, type SearchHit, type SearchKind } from '@/actions';
import { highlight, scoreMatch, tokenize } from '@/lib/search';
import { NAV } from '@/app/nav';
import { cx, plural } from '@/lib/format';
import { Card, Chip, Empty, PageHeader } from '@/ui/primitives';

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  task: CheckSquare, event: CalendarDays, note: NotebookPen, later: Bookmark, person: Users, log: History,
  inbox: Inbox, transaction: Receipt, goal: Target, habit: Flame, debt: HandCoins, recurring: Repeat,
  savings: PiggyBank, account: Landmark,
};

const RECENT_KEY = 'lifeos.search.recent';
function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
function saveRecent(q: string) {
  const list = [q, ...readRecent().filter((x) => x !== q)].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* приватный режим */ }
  return list;
}

/** Запрос с задержкой 150 мс — не ищем на каждую букву при быстром наборе */
function useDebounced<T>(v: T, ms = 150) {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [text, setText] = useState(() => params.get('q') ?? '');
  const q = useDebounced(text.trim());
  const [only, setOnly] = useState<SearchKind | null>(null);
  const [recent, setRecent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  // Запрос — в адрес (без новой записи в истории)
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) setParams(q ? { q } : {}, { replace: true });
    setOnly(null);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // useLiveQuery: результаты обновятся сами, если запись изменили (например, отметили задачу)
  const hits = useLiveQuery(() => (q ? searchAll(q) : Promise.resolve([] as SearchHit[])), [q]);
  const groups = useMemo(() => groupHits(hits ?? []), [hits]);
  const tokens = useMemo(() => tokenize(q), [q]);
  const sections = useMemo(() => (tokens.length ? NAV.filter((n) => n.path !== '/search' && scoreMatch(tokens, { title: n.label }) > 0) : []), [tokens]);
  const shown = only ? groups.filter((g) => g.kind === only) : groups;
  const total = hits?.length ?? 0;

  const open = (h: SearchHit) => {
    setRecent(saveRecent(q));
    navigate(h.path);
  };

  return (
    <>
      <PageHeader title="Поиск" />
      <form
        role="search"
        className="glass-strong sticky top-[max(0.5rem,env(safe-area-inset-top))] z-20 mb-4 flex items-center gap-2 rounded-2xl px-3"
        onSubmit={(e) => {
          e.preventDefault();
          const first = shown[0]?.items[0];
          if (first) open(first);
          else input.current?.blur(); // скрыть клавиатуру iPhone
        }}
      >
        <Search size={20} className="shrink-0 text-muted" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Задачи, заметки, люди, суммы…"
          aria-label="Что найти"
          enterKeyHint="search"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
        />
        {text && (
          <button type="button" onClick={() => { setText(''); input.current?.focus(); }} aria-label="Очистить"
            className="focus-ring grid h-8 w-8 place-items-center rounded-full bg-[rgb(var(--line)/0.08)] text-muted hover:text-fg">
            <X size={16} />
          </button>
        )}
      </form>

      {!q ? (
        <Card>
          {recent.length > 0 ? (
            <>
              <div className="mb-2 flex items-center">
                <p className="flex-1 text-sm font-medium text-muted">Недавние запросы</p>
                <button className="text-sm text-muted hover:text-fg" onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch { /* */ } setRecent([]); }}>Очистить</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => <Chip key={r} icon={<Clock size={13} />} onClick={() => setText(r)}>{r}</Chip>)}
              </div>
            </>
          ) : (
            <Empty icon={<Search size={26} />} title="Найдётся всё"
              hint="Ищу по задачам, событиям, заметкам и тегам, людям, «посмотреть позже», целям, привычкам, истории и деньгам — в том числе по сумме: «1250»." />
          )}
          <p className="mt-4 hidden text-xs text-muted lg:block">На ноутбуке поиск открывается клавишей <kbd className="rounded bg-[rgb(var(--line)/0.1)] px-1.5">/</kbd> или Ctrl+K.</p>
        </Card>
      ) : (
        <>
          {sections.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {sections.map((n) => (
                <Link key={n.path} to={n.path} className="focus-ring glass inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium">
                  <n.icon size={15} className="text-accent-teal" /> {n.label} <ArrowRight size={14} className="text-muted" />
                </Link>
              ))}
            </div>
          )}

          {hits && groups.length > 1 && (
            <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              <Chip active={!only} onClick={() => setOnly(null)}>Все · {total}</Chip>
              {groups.map((g) => <Chip key={g.kind} active={only === g.kind} onClick={() => setOnly(only === g.kind ? null : g.kind)}>{g.label} · {g.items.length}</Chip>)}
            </div>
          )}

          {!hits ? <div className="h-40" /> : groups.length === 0 ? (
            <Card>
              <Empty icon={<Search size={26} />} title="Ничего не нашлось"
                hint="Попробуйте другое слово или его начало. Удалённое лежит в корзине (Настройки → Корзина)." />
            </Card>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2" aria-live="polite">
              <p className="sr-only">Найдено: {total} {plural(total, ['результат', 'результата', 'результатов'])}</p>
              {shown.map((g) => {
                const Icon = KIND_ICON[g.kind];
                return (
                  <Card key={g.kind} title={g.label} icon={<Icon size={18} />} className="overflow-hidden !pb-2">
                    <ul className="-mx-4 divide-y divide-[rgb(var(--line)/0.07)] sm:-mx-5">
                      {g.items.map((h) => (
                        <li key={h.id}>
                          <button onClick={() => open(h)} className={cx('focus-ring flex w-full items-start gap-3 px-4 py-2.5 sm:px-5 text-left transition hover:bg-[rgb(var(--line)/0.04)]', h.dim && 'opacity-60')}>
                            <span className="min-w-0 flex-1">
                              <Marked className={cx('block truncate text-[15px] font-medium', h.dim && h.kind === 'task' && 'line-through')} text={h.title} tokens={tokens} />
                              {h.snippet && <Marked className="mt-0.5 line-clamp-2 block text-sm text-muted" text={h.snippet} tokens={tokens} />}
                              {h.meta && <span className="mt-0.5 block truncate text-xs text-muted">{h.meta}</span>}
                            </span>
                            <ArrowRight size={16} className="mt-1 shrink-0 text-muted" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Текст с подсветкой найденных слов */
function Marked({ text, tokens, className }: { text: string; tokens: string[]; className?: string }) {
  return (
    <span className={className}>
      {highlight(text, tokens).map((p, i) => (p.hit ? <mark key={i} className="rounded bg-sky-400/25 px-0.5 text-inherit">{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </span>
  );
}
