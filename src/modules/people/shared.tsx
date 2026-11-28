// Общие мелочи раздела «Люди» (лёгкие — нужны и главной)
import type { Person } from '@/db/types';
import { plural } from '@/lib/format';

export function birthdayText(days: number) {
  if (days === 0) return 'сегодня!';
  if (days === 1) return 'завтра';
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}

export function Avatar({ p, size = 44 }: { p: Pick<Person, 'name' | 'emoji' | 'color'>; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-slate-950" aria-hidden
      style={{ width: size, height: size, background: p.color, fontSize: p.emoji ? size * 0.5 : size * 0.4 }}>
      {p.emoji || (p.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

