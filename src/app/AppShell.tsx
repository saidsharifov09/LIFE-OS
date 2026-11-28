// Каркас: боковая панель на ноутбуке, нижняя панель + кнопка захвата на iPhone.
import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, LayoutGrid, Lock, Sparkles } from 'lucide-react';
import { db } from '@/db/db';
import { cx } from '@/lib/format';
import { NAV, BOTTOM_TABS } from './nav';
import { useVisibleNav } from './useNav';
import { useCapture } from '@/modules/capture/CaptureSheet';
import { useAssistant } from '@/modules/assistant/AssistantSheet';
import { useReminders } from '@/modules/calendar/reminders';
import { SyncBadge } from '@/modules/sync/SyncBadge';
import { usePinLock } from '@/modules/pin/PinLock';

function useInboxCount() {
  return useLiveQuery(async () => (await db.inbox.toArray()).filter((i) => !i.deletedAt && !i.processed).length, [], 0)
    ?? 0;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { open } = useCapture();
  const assistant = useAssistant();
  const inboxCount = useInboxCount();
  const location = useLocation();
  const navigate = useNavigate();
  const nav = useVisibleNav();
  const pin = usePinLock();
  useReminders();

  // Поиск с клавиатуры ноутбука: «/» (если курсор не в поле) или Ctrl+K / ⌘K — откуда угодно
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
      const ctrlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'л');
      if (ctrlK || (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '/' || e.key === '.'))) {
        if (document.querySelector('[role="dialog"]')) return; // открыта шторка — не мешаем
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="min-h-full">
      <div className="app-bg"><i /></div>

      {/* Боковая панель (ноутбук) */}
      <aside className="glass fixed inset-y-3 left-3 z-30 hidden w-60 flex-col rounded-4xl p-3 lg:flex">
        <div className="flex items-center gap-2 px-3 pb-4 pt-2">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
          <span className="flex-1 text-lg font-bold tracking-tight">Life OS</span>
          {pin.enabled && (
            <button onClick={pin.lock} aria-label="Заблокировать" title="Заблокировать (PIN)" className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-[rgb(var(--line)/0.07)] hover:text-fg">
              <Lock size={16} />
            </button>
          )}
        </div>
        <SyncBadge link className="mb-3 ml-2" />
        <button
          onClick={() => open()}
          className="grad-accent focus-ring mb-3 flex h-11 items-center justify-center gap-2 rounded-2xl font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={18} strokeWidth={2.5} /> Быстрая запись <kbd className="ml-1 rounded bg-black/10 px-1.5 text-xs">N</kbd>
        </button>
        <button
          onClick={() => assistant.open()}
          className="focus-ring mb-3 flex h-10 items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--line)/0.07)] text-[14px] font-medium transition hover:bg-[rgb(var(--line)/0.12)] active:scale-[0.98]"
        >
          <Sparkles size={16} className="text-accent-teal" /> Помощник <kbd className="ml-1 rounded bg-[rgb(var(--line)/0.1)] px-1.5 text-xs">A</kbd>
        </button>
        <nav className="no-scrollbar -mx-1 flex-1 overflow-y-auto px-1">
          {nav.filter((n) => n.sidebar).map((n) => (
            <SideLink key={n.path} to={n.path} icon={<n.icon size={18} />} label={n.label} badge={n.path === '/inbox' ? inboxCount : 0} />
          ))}
        </nav>
      </aside>

      {/* Контент */}
      <main className="pt-safe lg:pl-[16.5rem]">
        <m.div
          key={location.pathname.split('/')[1]}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mx-auto max-w-6xl px-4 pb-32 pt-3 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6"
        >
          {children}
        </m.div>
      </main>

      {/* Помощник (iPhone): рядом с кнопкой захвата, над нижней панелью справа */}
      <button
        onClick={() => assistant.open()}
        aria-label="Помощник"
        className="glass-strong focus-ring fixed right-4 z-30 grid h-12 w-12 place-items-center rounded-full shadow-lg transition active:scale-90 lg:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
      >
        <Sparkles size={22} className="text-accent-teal" />
      </button>

      {/* Нижняя панель (iPhone) */}
      <nav className="glass-strong bottom-safe fixed inset-x-3 z-30 flex h-16 items-center justify-around rounded-[1.75rem] px-1 lg:hidden" aria-label="Навигация">
        {BOTTOM_TABS.slice(0, 2).map((p) => <BottomTab key={p} path={p} />)}
        <button
          onClick={() => open()}
          aria-label="Быстрая запись"
          className="grad-accent focus-ring -mt-8 grid h-16 w-16 place-items-center rounded-full text-slate-950 shadow-xl shadow-cyan-500/30 transition active:scale-90"
        >
          <Plus size={30} strokeWidth={2.6} />
        </button>
        {BOTTOM_TABS.slice(2).map((p) => <BottomTab key={p} path={p} badge={p === '/more' ? inboxCount : 0} />)}
      </nav>
    </div>
  );
}

function SideLink({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cx('focus-ring relative mb-0.5 flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors',
          isActive ? 'text-fg' : 'text-muted hover:bg-[rgb(var(--line)/0.05)] hover:text-fg')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <m.span layoutId="side-active" className="absolute inset-0 -z-10 rounded-xl bg-[rgb(var(--line)/0.09)]" transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }} />}
          <span className={isActive ? 'text-accent-teal' : ''}>{icon}</span>
          <span className="flex-1">{label}</span>
          {!!badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sky-400/20 px-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-200">{badge}</span>}
        </>
      )}
    </NavLink>
  );
}

function BottomTab({ path, badge }: { path: string; badge?: number }) {
  const item = path === '/more' ? { label: 'Ещё', icon: LayoutGrid } : NAV.find((n) => n.path === path)!;
  const Icon = item.icon;
  return (
    <NavLink
      to={path}
      end={path === '/'}
      className={({ isActive }) => cx('focus-ring relative flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium', isActive ? 'text-fg' : 'text-muted')}
    >
      {({ isActive }) => (
        <>
          <Icon size={23} className={isActive ? 'text-accent-teal' : ''} strokeWidth={isActive ? 2.4 : 2} />
          {path === '/' ? 'День' : item.label}
          {!!badge && <span className="absolute right-3 top-0.5 h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-[var(--bg)]" />}
        </>
      )}
    </NavLink>
  );
}
