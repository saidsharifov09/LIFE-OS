// Редактор заметки: заголовок, текст (ссылки кликабельны ниже), раздел, теги, изображения, закрепить/архив/удалить.
// Закрытие шторки сохраняет изменения — ничего не теряется, если просто смахнуть.
import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, ImagePlus, Link2, Pin, PinOff, Trash2, X } from 'lucide-react';
import type { Note, NoteImage, NoteSection } from '@/db/types';
import { addNote, archiveNote, deleteNote, normalizeTag, updateNote } from '@/actions';
import { db } from '@/db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { compressImage, IMAGES_PER_NOTE } from '@/lib/image';
import { extractLinks, linkLabel } from '@/lib/links';
import { uid } from '@/lib/id';
import { cx } from '@/lib/format';
import { Button, Chip, Input, Label, Textarea } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';

interface Draft { title: string; body: string; sectionId: string; tags: string[]; images: NoteImage[]; pinned: boolean }

export function NoteEditor({ open, note, defaultSection, sections, onClose }: {
  open: boolean; note: Note | null; defaultSection?: string; sections: NoteSection[]; onClose: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<Draft>({ title: '', body: '', sectionId: '', tags: [], images: [], pinned: false });
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<NoteImage | null>(null);
  const [last, setLast] = useState(false);
  const fallbackSection = defaultSection ?? (sections.find((s) => s.name === 'Разное') ?? sections[0])?.id ?? '';
  if (open !== last) {
    setLast(open);
    if (open) {
      setD(note ? { title: note.title, body: note.body, sectionId: note.sectionId, tags: note.tags, images: note.images ?? [], pinned: note.pinned }
        : { title: '', body: '', sectionId: fallbackSection, tags: [], images: [], pinned: false });
      setTagText('');
    }
  }
  // Все теги — для подсказок
  const allTags = useLiveQuery(async () => {
    const s = new Set<string>();
    for (const n of await db.notes.toArray()) if (!n.deletedAt) n.tags.forEach((t) => s.add(t));
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, []) ?? [];

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const addTag = (raw: string) => {
    const parts = raw.split(/[,#\n]/).map(normalizeTag).filter(Boolean);
    if (parts.length) setD((x) => ({ ...x, tags: [...new Set([...x.tags, ...parts])] }));
    setTagText('');
  };

  const changed = note
    ? d.title !== note.title || d.body !== note.body || d.sectionId !== note.sectionId || d.pinned !== note.pinned
      || d.tags.join('|') !== note.tags.join('|') || d.images.map((i) => i.id).join('|') !== (note.images ?? []).map((i) => i.id).join('|')
    : !!(d.title.trim() || d.body.trim() || d.images.length);

  /** Сохранить (вызывается и кнопкой «Готово», и при закрытии) */
  const save = async () => {
    const pending = tagText.trim() ? [...new Set([...d.tags, ...tagText.split(/[,#]/).map(normalizeTag).filter(Boolean)])] : d.tags;
    const final = { ...d, tags: pending, title: d.title.trim() };
    if (!final.title && final.body.trim()) final.title = final.body.trim().split('\n')[0].slice(0, 80);
    if (note) {
      if (changed || pending !== d.tags) { await updateNote(note.id, final); toast.show('Заметка сохранена', { undo: true }); }
    } else if (changed) {
      await addNote(final);
      toast.show('Заметка добавлена ✓', { undo: true });
    }
    onClose();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = IMAGES_PER_NOTE - d.images.length;
    if (room <= 0) { toast.show(`Не больше ${IMAGES_PER_NOTE} изображений в заметке`, { tone: 'error' }); return; }
    setBusy(true);
    try {
      const out: NoteImage[] = [];
      for (const f of [...files].slice(0, room)) {
        if (!f.type.startsWith('image/')) continue;
        const r = await compressImage(f);
        out.push({ id: uid(), ...r });
      }
      setD((x) => ({ ...x, images: [...x.images, ...out] }));
      if (files.length > room) toast.show(`Добавлено ${room}: не больше ${IMAGES_PER_NOTE} в заметке`);
    } catch (e) {
      toast.show((e as Error).message || 'Не удалось добавить изображение', { tone: 'error' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const links = extractLinks(`${d.title}\n${d.body}`);
  const suggestions = allTags.filter((t) => !d.tags.includes(t) && (!tagText || t.startsWith(normalizeTag(tagText)))).slice(0, 8);

  return (
    <>
      <Sheet open={open} onClose={save} wide title={note ? 'Заметка' : 'Новая заметка'} footer={
        <div className="flex gap-2">
          {note && (
            <>
              <Button variant="danger" size="icon" aria-label="Удалить заметку" onClick={async () => { await deleteNote(note.id); toast.show('Заметка в корзине', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>
              <Button variant="soft" size="icon" aria-label={note.archived ? 'Вернуть из архива' : 'В архив'} title={note.archived ? 'Вернуть из архива' : 'В архив'} onClick={async () => {
                if (changed) await updateNote(note.id, { ...d, title: d.title.trim() });
                await archiveNote(note.id, !note.archived);
                toast.show(note.archived ? 'Заметка вернулась из архива' : 'Заметка в архиве', { undo: true });
                onClose();
              }}>{note.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</Button>
            </>
          )}
          <Button variant="soft" size="icon" aria-pressed={d.pinned} aria-label={d.pinned ? 'Открепить' : 'Закрепить'} title={d.pinned ? 'Открепить' : 'Закрепить сверху'} onClick={() => set('pinned', !d.pinned)}
            className={cx(d.pinned && '!bg-amber-400/20 text-amber-700 dark:text-amber-300')}>{d.pinned ? <PinOff size={18} /> : <Pin size={18} />}</Button>
          <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>Готово</Button>
        </div>
      }>
        <div className="space-y-4">
          <Input autoFocus={!note} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Заголовок" aria-label="Заголовок" className="text-[17px] font-semibold" />
          <Textarea value={d.body} onChange={(e) => set('body', e.target.value)} placeholder="Текст, мысли, ссылки…" aria-label="Текст заметки" className="min-h-[160px]" />

          {links.length > 0 && (
            <div>
              <Label>Ссылки</Label>
              <ul className="space-y-1">
                {links.map((u) => (
                  <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-xl bg-sky-400/10 px-3 py-1.5 text-sm text-sky-700 dark:text-sky-200">
                    <Link2 size={14} className="shrink-0" /><span className="truncate">{linkLabel(u)}</span></a></li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label>Изображения</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {d.images.map((img) => (
                <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl bg-[rgb(var(--line)/0.06)]">
                  <button type="button" className="focus-ring h-full w-full" onClick={() => setViewer(img)} aria-label="Открыть изображение">
                    <img src={img.data} alt="" className="h-full w-full object-cover" />
                  </button>
                  <button type="button" aria-label="Убрать изображение" onClick={() => set('images', d.images.filter((x) => x.id !== img.id))}
                    className="focus-ring absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><X size={15} /></button>
                </div>
              ))}
              {d.images.length < IMAGES_PER_NOTE && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                  className="focus-ring grid aspect-square place-items-center rounded-2xl border border-dashed border-[rgb(var(--line)/0.25)] text-muted transition hover:text-fg disabled:opacity-50">
                  <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus size={22} />{busy ? 'Сжимаю…' : 'Фото'}</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Выбрать изображения" onChange={(e) => onFiles(e.target.files)} />
            <p className="mt-1.5 text-xs text-muted">Фото сжимаются до 1280 px, чтобы база и синхронизация оставались лёгкими.</p>
          </div>

          <div>
            <Label>Раздел</Label>
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s) => <Chip key={s.id} active={d.sectionId === s.id} onClick={() => set('sectionId', s.id)}>{s.icon} {s.name}</Chip>)}
            </div>
          </div>

          <div>
            <Label>Теги</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {d.tags.map((t) => (
                <span key={t} className="inline-flex h-8 items-center gap-1 rounded-full bg-sky-400/15 pl-3 pr-1 text-[13px] font-medium text-sky-700 dark:text-sky-200">
                  #{t}
                  <button type="button" aria-label={`Убрать тег ${t}`} onClick={() => set('tags', d.tags.filter((x) => x !== t))} className="focus-ring grid h-6 w-6 place-items-center rounded-full hover:bg-sky-400/20"><X size={13} /></button>
                </span>
              ))}
              <Input value={tagText} onChange={(e) => { const v = e.target.value; if (/[,\n]$/.test(v)) addTag(v); else setTagText(v); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagText); } if (e.key === 'Backspace' && !tagText && d.tags.length) set('tags', d.tags.slice(0, -1)); }}
                placeholder={d.tags.length ? 'Ещё тег' : 'Тег и Enter'} aria-label="Новый тег" className="!h-8 !w-36 !rounded-full !px-3 !py-0 !text-[14px]" />
            </div>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((t) => <Chip key={t} onClick={() => addTag(t)}>+ #{t}</Chip>)}
              </div>
            )}
          </div>
          {note && <p className="text-xs text-muted">Изменено {new Date(note.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
      </Sheet>
      <Sheet open={!!viewer} onClose={() => setViewer(null)} title="Изображение" wide>
        {viewer && <img src={viewer.data} alt="" className="mx-auto max-h-[70dvh] rounded-2xl object-contain" />}
      </Sheet>
    </>
  );
}
