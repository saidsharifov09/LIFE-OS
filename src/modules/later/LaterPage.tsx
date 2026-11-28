// «Посмотреть позже»: ссылки, видео, фильмы, сериалы, статьи, книги — со статусом «посмотрел».
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, BookOpen, Check as CheckIcon, ExternalLink, FileText, Film, Link2, MoreHorizontal, Plus, Trash2, Tv, Video } from 'lucide-react';
import type { LaterItem, LaterKind } from '@/db/types';
import { addLater, deleteLater, listLater, markLater, updateLater } from '@/actions';
import { isSafeUrl, linkLabel } from '@/lib/links';
import { cx } from '@/lib/format';
import { Button, Card, Chip, Empty, Field, Input, Label, PageHeader, Segmented, Textarea } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { useOpenParam } from '@/app/useOpenParam';

export const LATER_KINDS: { id: LaterKind; name: string; icon: typeof Video; color: string }[] = [
  { id: 'video', name: 'Видео', icon: Video, color: '#f472b6' },
  { id: 'movie', name: 'Фильм', icon: Film, color: '#a78bfa' },
  { id: 'series', name: 'Сериал', icon: Tv, color: '#818cf8' },
  { id: 'article', name: 'Статья', icon: FileText, color: '#38bdf8' },
  { id: 'book', name: 'Книга', icon: BookOpen, color: '#fbbf24' },
  { id: 'link', name: 'Ссылка', icon: Link2, color: '#2dd4bf' },
  { id: 'other', name: 'Другое', icon: MoreHorizontal, color: '#94a3b8' },
];
const kindOf = (k: LaterKind) => LATER_KINDS.find((x) => x.id === k) ?? LATER_KINDS[LATER_KINDS.length - 1];

type Tab = 'todo' | 'done';

export default function LaterPage() {
  const toast = useToast();
  const items = useLiveQuery(() => listLater(), []);
  const [tab, setTab] = useState<Tab>('todo');
  const [kind, setKind] = useState<LaterKind | null>(null);
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<LaterItem | null>(null);
  useOpenParam('open', (id) => {
    if (!items) return false;
    const it = items.find((x) => x.id === id);
    if (it) { setTab(it.done ? 'done' : 'todo'); setKind(null); setEdit(it); }
  });

  if (!items) return <div className="h-40" />;
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const list = (tab === 'todo' ? todo : done).filter((i) => !kind || i.kind === kind);
  const kindsHere = LATER_KINDS.filter((k) => (tab === 'todo' ? todo : done).some((i) => i.kind === k.id));

  const add = async () => {
    if (!text.trim()) return;
    const it = await addLater({ title: text });
    setText('');
    toast.show(`Добавлено: ${kindOf(it.kind).name.toLowerCase()}`, { undo: true });
    setTab('todo');
  };

  return (
    <>
      <PageHeader title="Посмотреть позже" />
      <Card className="mb-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставьте ссылку или напишите название" aria-label="Ссылка или название" enterKeyHint="done" />
          <Button type="submit" variant="primary" size="icon" aria-label="Добавить" disabled={!text.trim()}><Plus size={20} /></Button>
        </form>
        <p className="mt-2 text-xs text-muted">Вид (видео, фильм, статья…) подставится сам — его можно поменять.</p>
      </Card>

      <Segmented<Tab> className="mb-3 max-w-sm" value={tab} onChange={(t) => { setTab(t); setKind(null); }}
        options={[{ value: 'todo', label: `К просмотру${todo.length ? ` · ${todo.length}` : ''}` }, { value: 'done', label: `Посмотрел${done.length ? ` · ${done.length}` : ''}` }]} />
      {kindsHere.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          <Chip active={!kind} onClick={() => setKind(null)}>Все</Chip>
          {kindsHere.map((k) => <Chip key={k.id} active={kind === k.id} color={k.color} onClick={() => setKind(kind === k.id ? null : k.id)}>{k.name}</Chip>)}
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <Empty icon={<Bookmark size={26} />} title={tab === 'todo' ? 'Список пуст' : 'Пока ничего не отмечено'}
            hint={tab === 'todo' ? 'Увидели интересное видео или посоветовали фильм — сохраните сюда за пару секунд.' : 'Отмечайте кружком то, что посмотрели или прочитали.'} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {list.map((it) => {
              const k = kindOf(it.kind);
              return (
                <motion.li key={it.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className="glass flex items-center gap-3 rounded-2xl p-2.5 pl-3">
                  <button type="button" aria-label={it.done ? `Вернуть «${it.title}» в список` : `Посмотрел: ${it.title}`} aria-pressed={it.done}
                    onClick={async () => { await markLater(it.id, !it.done); toast.show(it.done ? 'Вернул в список' : 'Отмечено: посмотрел ✓', { undo: true }); }}
                    className={cx('focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-90', it.done ? 'bg-emerald-400 text-slate-950' : 'ring-2 ring-[rgb(var(--line)/0.3)] hover:ring-emerald-400')}>
                    {it.done && <CheckIcon size={16} strokeWidth={3} />}
                  </button>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${k.color}22`, color: k.color }}><k.icon size={18} /></span>
                  <button type="button" className="focus-ring min-w-0 flex-1 text-left" onClick={() => setEdit(it)}>
                    <span className={cx('block truncate font-medium', it.done && 'text-muted line-through decoration-1')}>{it.title}</span>
                    <span className="block truncate text-xs text-muted">{k.name}{it.url ? ` · ${linkLabel(it.url)}` : ''}{it.note ? ` · ${it.note}` : ''}</span>
                  </button>
                  {isSafeUrl(it.url) && (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" aria-label={`Открыть ${it.title}`} className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sky-600 hover:bg-sky-400/10 dark:text-sky-300"><ExternalLink size={18} /></a>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <LaterEditor item={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function LaterEditor({ item, onClose }: { item: LaterItem | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ title: '', url: '', kind: 'other' as LaterKind, note: '' });
  const [last, setLast] = useState<string | null>(null);
  if ((item?.id ?? null) !== last) {
    setLast(item?.id ?? null);
    if (item) setD({ title: item.title, url: item.url ?? '', kind: item.kind, note: item.note ?? '' });
  }
  const save = async () => {
    if (!item) return;
    const url = d.url.trim();
    if (url && !isSafeUrl(url)) { toast.show('Ссылка должна начинаться с http:// или https://', { tone: 'error' }); return; }
    await updateLater(item.id, { title: d.title.trim() || item.title, url: url || undefined, kind: d.kind, note: d.note.trim() || undefined });
    toast.show('Сохранено', { undo: true });
    onClose();
  };
  return (
    <Sheet open={!!item} onClose={onClose} title="Посмотреть позже" footer={
      <div className="flex gap-2">
        {item && <Button variant="danger" size="icon" aria-label="Удалить" onClick={async () => { await deleteLater(item.id); toast.show('Удалено в корзину', { undo: true }); onClose(); }}><Trash2 size={18} /></Button>}
        <Button variant="primary" className="flex-1" onClick={save}>Готово</Button>
      </div>
    }>
      <div className="space-y-4">
        <Field label="Название"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
        <Field label="Ссылка"><Input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://…" inputMode="url" type="url" /></Field>
        <div>
          <Label>Что это</Label>
          <div className="flex flex-wrap gap-1.5">
            {LATER_KINDS.map((k) => <Chip key={k.id} color={k.color} active={d.kind === k.id} onClick={() => setD({ ...d, kind: k.id })}>{k.name}</Chip>)}
          </div>
        </div>
        <Field label="Заметка"><Textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Кто посоветовал, о чём…" className="min-h-[64px]" /></Field>
      </div>
    </Sheet>
  );
}
