// Управление разделами блокнота: создать, переименовать (и значок), порядок, удалить (заметки переезжают в «Разное»).
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { NoteSection } from '@/db/types';
import { addSection, deleteSection, moveSection, updateSection } from '@/actions';
import { cx } from '@/lib/format';
import { Button, Input, Label } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';

export const SECTION_EMOJI = ['📁', '🙂', '💡', '📍', '💬', '🛒', '🎬', '📚', '🧠', '⭐', '🚀', '📝', '🍲', '✈️', '🏠', '💼', '🎁', '🎵', '💪', '❤️', '🌱', '🧾', '🎮', '🐾'];

export function SectionsSheet({ open, onClose, sections, counts }: { open: boolean; onClose: () => void; sections: NoteSection[]; counts: Map<string, number> }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [iconFor, setIconFor] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    await addSection(name, icon);
    toast.show('Раздел создан', { undo: true });
    setName('');
    setIcon('📁');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Разделы блокнота" footer={<Button variant="primary" className="w-full" onClick={onClose}>Готово</Button>}>
      <ul className="space-y-1.5">
        {sections.map((s, i) => (
          <li key={s.id}>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setIconFor(iconFor === s.id ? null : s.id)} aria-label={`Значок раздела ${s.name}`}
                className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--line)/0.06)] text-xl">{s.icon ?? '📁'}</button>
              <Input defaultValue={s.name} key={s.updatedAt} aria-label={`Название раздела ${s.name}`} className="!py-2.5"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) updateSection(s.id, { name: v }); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted" title="Заметок">{counts.get(s.id) ?? 0}</span>
              <Button size="icon" variant="ghost" aria-label="Выше" disabled={i === 0} onClick={() => moveSection(s.id, -1)} className="!w-9"><ArrowUp size={17} /></Button>
              <Button size="icon" variant="ghost" aria-label="Ниже" disabled={i === sections.length - 1} onClick={() => moveSection(s.id, 1)} className="!w-9"><ArrowDown size={17} /></Button>
              <Button size="icon" variant="ghost" aria-label={`Удалить раздел ${s.name}`} disabled={sections.length <= 1} className="!w-9 text-red-700 dark:text-red-300" onClick={async () => {
                const n = counts.get(s.id) ?? 0;
                if (n && !confirm(`Удалить раздел «${s.name}»? Заметки (${n}) переедут в «Разное».`)) return;
                try {
                  const target = await deleteSection(s.id);
                  toast.show(n ? `Раздел удалён, заметки — в «${target.name}»` : 'Раздел удалён', { undo: true });
                } catch (e) { toast.show((e as Error).message, { tone: 'error' }); }
              }}><Trash2 size={17} /></Button>
            </div>
            {iconFor === s.id && <EmojiGrid value={s.icon ?? '📁'} onChange={(e) => { updateSection(s.id, { icon: e }); setIconFor(null); }} />}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <Label>Новый раздел</Label>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setIconFor(iconFor === '__new' ? null : '__new')} aria-label="Значок нового раздела"
            className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--line)/0.06)] text-xl">{icon}</button>
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Например: Рецепты" aria-label="Название нового раздела" className="!py-2.5" />
          <Button variant="primary" size="icon" aria-label="Создать раздел" onClick={create} disabled={!name.trim()}><Plus size={20} /></Button>
        </div>
        {iconFor === '__new' && <EmojiGrid value={icon} onChange={(e) => { setIcon(e); setIconFor(null); }} />}
      </div>
    </Sheet>
  );
}

function EmojiGrid({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="mt-2 grid grid-cols-8 gap-1.5">
      {SECTION_EMOJI.map((e) => (
        <button key={e} type="button" onClick={() => onChange(e)} aria-label={`Значок ${e}`} aria-pressed={value === e}
          className={cx('focus-ring grid aspect-square place-items-center rounded-xl text-xl', value === e ? 'bg-sky-400/20 ring-1 ring-sky-400/60' : 'bg-[rgb(var(--line)/0.05)] hover:bg-[rgb(var(--line)/0.1)]')}>{e}</button>
      ))}
    </div>
  );
}
