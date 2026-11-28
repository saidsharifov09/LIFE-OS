// Сетка времени для видов «День» и «Неделя». Перенос событий перетаскиванием (шаг 15 минут).
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { DateStr, Task } from '@/db/types';
import { moveEvent, type Occurrence } from '@/actions';
import { fmtRelative, minToTime, nowTime, timeToMin, today, WEEKDAYS_SHORT, weekday, fromDateStr } from '@/lib/dates';
import { cx } from '@/lib/format';
import { useToast } from '@/ui/overlay';

const HOUR = 52; // высота часа в пикселях
const SNAP = 15;

interface Placed { occ: Occurrence; top: number; height: number; col: number; cols: number }

/** Раскладка пересекающихся событий по колонкам */
function layout(list: Occurrence[]): Placed[] {
  const items = list
    .filter((o) => o.event.start)
    .map((o) => {
      const s = timeToMin(o.event.start!);
      return { occ: o, s, e: s + Math.max(o.event.duration, 20) };
    })
    .sort((a, b) => a.s - b.s);
  const out: Placed[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    const colsEnd: number[] = [];
    const assigned = cluster.map((it) => {
      let c = colsEnd.findIndex((end) => end <= it.s);
      if (c === -1) { c = colsEnd.length; colsEnd.push(it.e); } else colsEnd[c] = it.e;
      return { it, c };
    });
    for (const { it, c } of assigned) {
      out.push({ occ: it.occ, top: (it.s / 60) * HOUR, height: Math.max(((it.e - it.s) / 60) * HOUR, 22), col: c, cols: colsEnd.length });
    }
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

interface DragState { key: string; startX: number; startY: number; dx: number; dy: number; moved: boolean }

export function TimeGrid({ days, occurrences, tasks, onOpen, onCreate }: {
  days: DateStr[];
  occurrences: Occurrence[];
  tasks: Task[];
  onOpen: (o: Occurrence) => void;
  onCreate: (date: DateStr, time: string) => void;
}) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [now, setNow] = useState(nowTime());
  const t0 = today();

  useEffect(() => {
    const h = Math.max(0, new Date().getHours() - 1);
    scrollRef.current?.scrollTo({ top: Math.min(h, 7) * HOUR });
    const id = setInterval(() => setNow(nowTime()), 60000);
    return () => clearInterval(id);
  }, []);

  const colWidth = () => (colsRef.current ? colsRef.current.clientWidth / days.length : 1);

  const onDown = (e: RPointerEvent, key: string) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ key, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false });
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 6 || Math.abs(dy) > 6 });
  };
  const onUp = async (o: Occurrence) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) { onOpen(o); return; }
    const dayShift = days.length > 1 ? Math.round(d.dx / colWidth()) : 0;
    const minShift = Math.round(((d.dy / HOUR) * 60) / SNAP) * SNAP;
    if (!dayShift && !minShift) return;
    const idx = Math.min(days.length - 1, Math.max(0, days.indexOf(o.date) + dayShift));
    const newStart = minToTime(Math.min(24 * 60 - SNAP, Math.max(0, timeToMin(o.event.start!) + minShift)));
    await moveEvent(o.event.id, o.date, days[idx], newStart);
    toast.show(`Перенесено: ${fmtRelative(days[idx]).toLowerCase()}, ${newStart}${o.event.recurrence ? ' (вся серия)' : ''}`, { undo: true });
  };

  const allDay = occurrences.filter((o) => !o.event.start);

  return (
    <div className="glass overflow-hidden rounded-3xl">
      {/* Заголовки дней (для недели) */}
      {days.length > 1 && (
        <div className="hairline flex border-b pl-11">
          {days.map((d) => (
            <div key={d} className={cx('flex-1 py-2 text-center', d === t0 && 'text-teal-700 dark:text-accent-teal')}>
              <div className="text-[11px] uppercase text-muted">{WEEKDAYS_SHORT[weekday(d)]}</div>
              <div className={cx('mx-auto grid h-8 w-8 place-items-center rounded-full text-[15px] font-semibold', d === t0 && 'grad-accent text-slate-950')}>{fromDateStr(d).getDate()}</div>
            </div>
          ))}
        </div>
      )}
      {/* События на весь день и задачи без времени */}
      {(allDay.length > 0 || tasks.some((t) => !t.time)) && (
        <div className="hairline flex border-b pl-11">
          {days.map((d) => (
            <div key={d} className="min-w-0 flex-1 space-y-1 p-1">
              {allDay.filter((o) => o.date === d).map((o) => (
                <button key={o.event.id + d} onClick={() => onOpen(o)} className="block w-full truncate rounded-lg px-2 py-0.5 text-left text-[12px] font-medium" style={{ background: o.event.color + '40' }}>{o.event.title}</button>
              ))}
              {tasks.filter((t) => t.date === d && !t.time).slice(0, days.length > 1 ? 2 : 10).map((t) => (
                <div key={t.id} className={cx('truncate rounded-lg border border-dashed border-teal-400/50 px-2 py-0.5 text-[12px]', t.done && 'text-muted line-through')}>☐ {t.title}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="relative max-h-[calc(100dvh-17rem)] overflow-y-auto lg:max-h-[calc(100dvh-12rem)]">
        <div className="relative flex" style={{ height: 24 * HOUR }}>
          {/* Шкала часов */}
          <div className="w-11 shrink-0">
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="relative text-right text-[10px] tabular-nums text-muted" style={{ height: HOUR }}>
                {h > 0 && <span className="absolute -top-2 right-1.5">{String(h).padStart(2, '0')}:00</span>}
              </div>
            ))}
          </div>
          <div ref={colsRef} className="relative flex flex-1">
            {/* Линии часов */}
            <div className="pointer-events-none absolute inset-0">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="hairline border-t" style={{ height: HOUR }} />
              ))}
            </div>
            {days.map((d) => {
              const placed = layout(occurrences.filter((o) => o.date === d));
              const timedTasks = tasks.filter((t) => t.date === d && t.time);
              return (
                <div
                  key={d}
                  className="hairline relative flex-1 border-l first:border-l-0"
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const y = e.nativeEvent.offsetY;
                    onCreate(d, minToTime(Math.floor(((y / HOUR) * 60) / 30) * 30));
                  }}
                >
                  {d === t0 && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (timeToMin(now) / 60) * HOUR }}>
                      <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <span className="h-0.5 flex-1 bg-rose-400/80" />
                    </div>
                  )}
                  {timedTasks.map((t) => (
                    <div key={t.id} className={cx('pointer-events-none absolute right-1 z-0 truncate rounded-md border border-dashed border-teal-400/60 bg-teal-400/10 px-1.5 text-[11px]', t.done && 'line-through opacity-60')}
                      style={{ top: (timeToMin(t.time!) / 60) * HOUR + 1, left: '40%', height: 20 }}>
                      ☐ {t.title}
                    </div>
                  ))}
                  {placed.map((p) => {
                    const key = p.occ.event.id + p.occ.date;
                    const isDrag = drag?.key === key && drag.moved;
                    const ev = p.occ.event;
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        aria-label={`${ev.title}, ${ev.start}`}
                        onKeyDown={(e) => e.key === 'Enter' && onOpen(p.occ)}
                        onPointerDown={(e) => onDown(e, key)}
                        onPointerMove={onMove}
                        onPointerUp={() => onUp(p.occ)}
                        onPointerCancel={() => setDrag(null)}
                        className={cx('focus-ring absolute z-10 cursor-grab touch-none select-none overflow-hidden rounded-xl border-l-[3px] px-2 py-1 text-left shadow-sm', isDrag && 'z-30 cursor-grabbing opacity-90 shadow-xl')}
                        style={{
                          top: p.top + 1, height: p.height - 2,
                          left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`,
                          background: ev.color + '38', borderColor: ev.color,
                          transform: isDrag ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
                        }}
                      >
                        <div className="truncate text-[12px] font-semibold leading-tight">{ev.title}</div>
                        {p.height > 34 && <div className="truncate text-[11px] text-muted">{ev.start}–{minToTime(timeToMin(ev.start!) + ev.duration)}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
