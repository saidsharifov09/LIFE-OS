// Индикаторы и отклик: чекбокс с анимацией, кольцо и полоса прогресса, конфетти.
import { useEffect, useId, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { cx } from '@/lib/format';

// ---------- Чекбокс ----------
export function Check({ checked, onChange, label, color = '#2dd4bf', size = 26 }: {
  checked: boolean; onChange: () => void; label: string; color?: string; size?: number;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="focus-ring group relative grid shrink-0 place-items-center rounded-full"
      style={{ width: size + 14, height: size + 14 }}
    >
      <m.span
        className="grid place-items-center rounded-full border-2"
        style={{ width: size, height: size, borderColor: checked ? 'transparent' : color }}
        animate={{ scale: checked ? [1, 1.25, 1] : 1, backgroundColor: checked ? color : 'rgba(0,0,0,0)' }}
        transition={{ duration: 0.3 }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#0b1020" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <m.path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray="1 1" initial={false} animate={{ strokeDashoffset: checked ? 0 : 1 }} transition={{ duration: 0.25, delay: checked ? 0.08 : 0 }} />
        </svg>
      </m.span>
    </button>
  );
}

// ---------- Кольцо прогресса ----------
export function Ring({ value, size = 96, stroke = 10, children, colors = ['#38bdf8', '#2dd4bf', '#34d399'] }: {
  value: number; size?: number; stroke?: number; children?: React.ReactNode; colors?: string[];
}) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {colors.map((col, i) => <stop key={i} offset={i / (colors.length - 1)} stopColor={col} />)}
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth={stroke} />
        <m.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// ---------- Полоса прогресса ----------
/** label — что измеряет полоса (для экранного диктора): «Бюджет: Кафе», «Привычка за неделю»… */
export function Bar({ value, danger, warn, className, label = 'Прогресс' }: { value: number; danger?: boolean; warn?: boolean; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-[rgb(var(--line)/0.08)]', className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <m.div
        className={cx('h-full rounded-full', danger ? 'bg-gradient-to-r from-orange-400 to-red-500' : warn ? 'bg-gradient-to-r from-amber-300 to-orange-400' : 'grad-accent')}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

// ---------- Конфетти ----------
type Listener = () => void;
const confettiListeners = new Set<Listener>();
/** Запустить небольшое конфетти (за серию выполненных задач или 100% дня) */
export function fireConfetti() {
  confettiListeners.forEach((l) => l());
}

const COLORS = ['#38bdf8', '#2dd4bf', '#34d399', '#a78bfa', '#fbbf24', '#f472b6'];

export function ConfettiHost() {
  const [bursts, setBursts] = useState<number[]>([]);
  const reduce = useReducedMotion();
  useEffect(() => {
    const l = () => setBursts((b) => [...b, Date.now()]);
    confettiListeners.add(l);
    return () => { confettiListeners.delete(l); };
  }, []);
  useEffect(() => {
    if (!bursts.length) return;
    const t = setTimeout(() => setBursts((b) => b.slice(1)), 1600);
    return () => clearTimeout(t);
  }, [bursts]);
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      <AnimatePresence>
        {bursts.map((id) => (
          <div key={id} className="absolute left-1/2 top-1/3">
            {Array.from({ length: 28 }).map((_, i) => {
              const angle = (i / 28) * Math.PI * 2;
              const dist = 90 + ((i * 37) % 80);
              return (
                <m.span
                  key={i}
                  className="absolute block h-2.5 w-1.5 rounded-sm"
                  style={{ background: COLORS[i % COLORS.length] }}
                  initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                  animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist + 160, opacity: 0, rotate: 360 + i * 20 }}
                  transition={{ duration: 1.4, ease: [0.2, 0.7, 0.4, 1] }}
                />
              );
            })}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
