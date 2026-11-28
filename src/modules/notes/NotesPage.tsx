// «Блокнот»: свои разделы, заметки с тегами, ссылками и изображениями, закрепление, архив.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Image as ImageIcon, Link2, NotebookPen, Pin, Plus, Search, Settings2, X } from 'lucide-react';
import type { Note } from '@/db/types';
import { ensureNoteSections, listNotes, listSections, noteLinks } from '@/actions';
import { cx, plural } from '@/lib/format';
import { Button, Card, Chip, Empty, Input, PageHeader } from '@/ui/primitives';
import { NoteEditor } from './NoteEditor';
import { SectionsSheet } from './SectionsSheet';

const ALL = '__all';
const LS_KEY = 'lifeos.notes.section';

export default function NotesPage() {
  const [section, setSection] = useState<string>(() => { try { return localStorage.getItem(LS_KEY) || ALL; } catch { return ALL; } });
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [edit, setEdit] = useState<Note | 'new' | null>(null);
  const [manage, setManage] = useState(false);

  // Стартовые разделы — при первом открытии (запись вне liveQuery)
  useEffect(() => { ensureNoteSections(); }, []);
  const sections = useLiveQuery(() => listSections(), []);
  const notes = useLiveQuery(() => listNotes(), []);

  const pick = (id: string) => { setSection(id); setTag(null); try { localStorage.setItem(LS_KEY, id); } catch { /* */ } };
  // Раздел удалили (или он с другого устройства исчез) — вернуться к «Все»
  const current = sections?.find((s) => s.id === section);
  useEffect(() => { if (sections?.length && section !== ALL && !current) pick(ALL); });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes ?? []) if (!n.archived) m.set(n.sectionId, (m.get(n.sectionId) ?? 0) + 1);
    return m;
  }, [notes]);

  const inView = useMemo(() => (notes ?? []).filter((n) => !!n.archived === archived && (section === ALL || n.sectionId === section)), [notes, archived, section]);
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of inView) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([t]) => t);
  }, [inView]);
  const q = query.trim().toLowerCase();
  const shown = inView.filter((n) => (!tag || n.tags.includes(tag)) && (!q || `${n.title}\n${n.body}\n${n.tags.join(' ')}`.toLowerCase().includes(q)));
  const archivedCount = (notes ?? []).filter((n) => n.archived).length;

  if (!sections || !notes) return <div className="h-40" />;
  const secName = (id: string) => sections.find((s) => s.id === id);

  return (
    <>
      <PageHeader title="Блокнот" subtitle={archived ? 'Архив' : current ? `${current.icon ?? ''} ${current.name}` : undefined}
        action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setEdit('new')}>Заметка</Button>} />
      <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-5">
        {/* Разделы: на iPhone — лента чипов, на ноутбуке — колонка */}
        <nav aria-label="Разделы блокнота" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-visible lg:px-0">
          <SectionButton active={section === ALL} onClick={() => pick(ALL)} icon="🗂️" name="Все" count={(notes ?? []).filter((n) => !n.archived).length} />
          {sections.map((s) => <SectionButton key={s.id} active={section === s.id} onClick={() => pick(s.id)} icon={s.icon ?? '📁'} name={s.name} count={counts.get(s.id) ?? 0} />)}
          <button onClick={() => setManage(true)} className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-sky-600 hover:bg-[rgb(var(--line)/0.06)] lg:mt-1 lg:h-10 lg:rounded-2xl dark:text-sky-300">
            <Settings2 size={15} /> Разделы
          </button>
        </nav>

        <div className="min-w-0">
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в заметках" aria-label="Найти в заметках" className="!py-2.5 pl-10" type="search" />
            </div>
            <Button variant={archived ? 'primary' : 'soft'} icon={<Archive size={16} />} aria-pressed={archived} aria-label={`Архив${archivedCount ? `: ${archivedCount}` : ""}`} title="Архив" onClick={() => { setArchived(!archived); setTag(null); }}>
              <span className="hidden sm:inline">Архив</span>{archivedCount > 0 && <span className="tabular-nums">{archivedCount}</span>}
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {tags.map((t) => <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</Chip>)}
              {tag && <Chip onClick={() => setTag(null)} icon={<X size={13} />}>Сбросить</Chip>}
            </div>
          )}

          {shown.length === 0 ? (
            <Card>
              <Empty icon={archived ? <Archive size={26} /> : <NotebookPen size={26} />}
                title={q || tag ? 'Ничего не нашлось' : archived ? 'Архив пуст' : 'Здесь пока пусто'}
                hint={q || tag ? 'Попробуйте другое слово или сбросьте тег.' : archived ? 'Сюда попадают заметки, которые жалко удалять, но не нужны каждый день.' : 'Запишите мысль, ссылку или фото — всё в одном месте.'}
                action={!archived && !q && !tag ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>Новая заметка</Button> : undefined} />
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {shown.map((n) => {
                  const sec = section === ALL ? secName(n.sectionId) : undefined;
                  const links = noteLinks(n).length;
                  const img = n.images?.[0];
                  return (
                    <motion.li key={n.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
                      <button onClick={() => setEdit(n)} className="glass focus-ring flex h-full w-full flex-col overflow-hidden rounded-3xl text-left transition active:scale-[0.99]">
                        {img && <img src={img.data} alt="" className="h-36 w-full object-cover" loading="lazy" />}
                        <span className="flex flex-1 flex-col gap-1.5 p-4">
                          <span className="flex items-start gap-2">
                            <span className="min-w-0 flex-1 font-semibold leading-snug">{n.title || <span className="text-muted">Без названия</span>}</span>
                            {n.pinned && <Pin size={15} className="mt-0.5 shrink-0 rotate-45 text-amber-500 dark:text-amber-300" aria-label="Закреплена" />}
                          </span>
                          {n.body && <span className="line-clamp-3 whitespace-pre-line text-sm text-muted">{n.body}</span>}
                          <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
                            {sec && <span>{sec.icon} {sec.name}</span>}
                            {n.tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-sky-400/12 px-2 py-0.5 text-sky-700 dark:text-sky-200">#{t}</span>)}
                            {links > 0 && <span className="inline-flex items-center gap-0.5"><Link2 size={12} />{links}</span>}
                            {(n.images?.length ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><ImageIcon size={12} />{n.images!.length}</span>}
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          {shown.length > 0 && <p className="mt-3 text-center text-xs text-muted">{shown.length} {plural(shown.length, ['заметка', 'заметки', 'заметок'])}</p>}
        </div>
      </div>
      <NoteEditor open={!!edit} note={edit === 'new' ? null : edit} defaultSection={section === ALL ? undefined : section} sections={sections} onClose={() => setEdit(null)} />
      <SectionsSheet open={manage} onClose={() => setManage(false)} sections={sections} counts={counts} />
    </>
  );
}

function SectionButton({ active, onClick, icon, name, count }: { active: boolean; onClick: () => void; icon: string; name: string; count: number }) {
  return (
    <button onClick={onClick} aria-current={active ? 'true' : undefined}
      className={cx('focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition lg:h-10 lg:w-full lg:rounded-2xl lg:text-sm',
        active ? 'bg-sky-400/20 text-sky-700 ring-1 ring-sky-400/50 dark:text-sky-200' : 'bg-[rgb(var(--line)/0.06)] text-muted hover:text-fg lg:bg-transparent')}>
      <span aria-hidden>{icon}</span>
      <span className="lg:flex-1 lg:truncate lg:text-left">{name}</span>
      {count > 0 && <span className="text-xs tabular-nums opacity-70">{count}</span>}
    </button>
  );
}
