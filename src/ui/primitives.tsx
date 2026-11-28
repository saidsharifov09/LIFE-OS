// Базовые элементы дизайн-системы: карточка, кнопки, поля, чипы, сегменты.
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { m, type HTMLMotionProps } from 'framer-motion';
import { cx } from '@/lib/format';

// ---------- Карточка ----------
interface CardProps extends Omit<HTMLMotionProps<'section'>, 'title'> {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  pad?: boolean;
  strong?: boolean;
}
export function Card({ title, icon, action, pad = true, strong, className, children, ...rest }: CardProps) {
  return (
    <m.section
      layout="position"
      className={cx(strong ? 'glass-strong' : 'glass', 'rounded-3xl', pad && 'p-4 sm:p-5', className)}
      {...rest}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center gap-2">
          {icon && <span className="text-accent-teal">{icon}</span>}
          {title && <h2 className="flex-1 text-[15px] font-semibold tracking-tight">{title}</h2>}
          {action}
        </header>
      )}
      {children as ReactNode}
    </m.section>
  );
}

// ---------- Кнопка ----------
type Variant = 'primary' | 'glass' | 'ghost' | 'danger' | 'soft';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', icon, className, children, type = 'button', ...rest }, ref,
) {
  const v: Record<Variant, string> = {
    primary: 'grad-accent text-slate-950 font-semibold shadow-lg shadow-cyan-500/20 hover:brightness-110',
    glass: 'glass text-fg hover:bg-white/10',
    ghost: 'text-fg hover:bg-[rgb(var(--line)/0.07)]',
    soft: 'bg-[rgb(var(--line)/0.07)] text-fg hover:bg-[rgb(var(--line)/0.12)]',
    danger: 'bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25',
  };
  const s = {
    sm: 'h-9 px-3 text-sm gap-1.5 rounded-xl',
    md: 'h-11 px-4 text-[15px] gap-2 rounded-2xl',
    lg: 'h-14 px-6 text-base gap-2 rounded-2xl',
    icon: 'h-11 w-11 rounded-2xl justify-center',
  }[size];
  return (
    <button
      ref={ref}
      type={type}
      className={cx('focus-ring inline-flex select-none items-center justify-center whitespace-nowrap transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40', v[variant], s, className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

// ---------- Поля ----------
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('field', className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('field min-h-[88px] resize-y', className)} {...rest} />;
});
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted', className)}>{children}</span>;
}
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

// ---------- Чип ----------
export function Chip({
  active, children, onClick, color, className, icon,
}: { active?: boolean; children: ReactNode; onClick?: () => void; color?: string; className?: string; icon?: ReactNode }) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick && active !== undefined ? active : undefined}
      className={cx(
        'focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition',
        active ? 'bg-sky-400/20 text-sky-700 ring-1 ring-sky-400/50 dark:text-sky-200' : 'bg-[rgb(var(--line)/0.06)] text-muted hover:text-fg',
        onClick && 'active:scale-95',
        className,
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {icon}
      {children}
    </Comp>
  );
}

// ---------- Сегментированный переключатель ----------
export function Segmented<T extends string>({
  value, onChange, options, className,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('relative flex rounded-2xl bg-[rgb(var(--line)/0.06)] p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('focus-ring relative z-10 flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors', value === o.value ? 'text-fg' : 'text-muted hover:text-fg')}
        >
          {value === o.value && (
            // Без layoutId: он мешает удалению шторок (AnimatePresence) — индикатор просто плавно появляется
            <m.span initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }} className="glass-strong absolute inset-0 -z-10 rounded-xl" />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Пустое состояние ----------
export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[rgb(var(--line)/0.06)] text-accent-teal">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Заголовок страницы ----------
export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end gap-3 pt-2 lg:mb-6">
      <div className="min-w-0 flex-1">
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight lg:text-3xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

// ---------- Переключатель ----------
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('focus-ring relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'grad-accent' : 'bg-[rgb(var(--line)/0.18)]')}
    >
      {/* Сдвиг через x, а не layout: layout-анимация «отрывала» кружок при перестановке строк списка */}
      <m.span initial={false} animate={{ x: checked ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow" />
    </button>
  );
}
