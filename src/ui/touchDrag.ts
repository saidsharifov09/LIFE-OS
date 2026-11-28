// Перетаскивание пальцем и мышью — одно на всё приложение (канбан, месячный календарь, список недели).
// HTML5 drag-and-drop на iPhone не работает, поэтому всё на pointer-событиях:
// - палец: долгое нажатие (~0,4 с) «поднимает» карточку (вибрация), потом её можно вести. Если палец сразу
//   поехал — это прокрутка, перетаскивание не начинается. Обычное касание по-прежнему открывает запись;
// - мышь: перетаскивание начинается, когда курсор сдвинулся на несколько пикселей.
// Куда можно бросить — элементы с атрибутом data-drop="<ключ>"; над ними ставится data-drag-over (подсветка в CSS).
// У краёв экрана и у краёв контейнера data-drag-scroll (канбан) содержимое прокручивается само.
import { useRef, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react';

const LONG_PRESS_MS = 380;
/** Палец сдвинулся больше — значит, человек листает, а не перетаскивает */
const TOUCH_SLOP = 10;
const MOUSE_SLOP = 6;
const EDGE = 56;

export interface DragOptions {
  /** Бросили на элемент с data-drop="key" */
  onDrop: (key: string) => void;
  disabled?: boolean;
}

let active = false;
/** Идёт ли перетаскивание (например, чтобы не открывать запись по случайному клику) */
export const isDragging = () => active;

export function useTouchDrag({ onDrop, disabled }: DragOptions) {
  // Последний onDrop — без пересоздания обработчиков
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const suppressClick = useRef(false);

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (disabled || active || e.button !== 0) return;
    // Не начинать с кнопок и полей внутри карточки (чекбокс задачи, «→»)
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="checkbox"], [data-no-drag]')) return;
    const el = e.currentTarget;
    const touch = e.pointerType !== 'mouse';
    const startX = e.clientX, startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const offX = startX - rect.left, offY = startY - rect.top;
    let x = startX, y = startY;
    let started = false;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    let raf = 0;

    const setOver = (t: HTMLElement | null) => {
      if (t === over) return;
      over?.removeAttribute('data-drag-over');
      t?.setAttribute('data-drag-over', '');
      over = t;
    };

    const findTarget = () => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      return (hit?.closest('[data-drop]') as HTMLElement | null) ?? null;
    };

    // Автопрокрутка у краёв: экран по вертикали, контейнер data-drag-scroll по горизонтали
    const autoScroll = () => {
      if (!started) return;
      // Скорость растёт, чем ближе палец к краю: у самого края ~14 px за кадр, на границе зоны — 2
      const speed = (depth: number) => Math.round(2 + 12 * Math.min(1, Math.max(0, depth / EDGE)));
      const vh = window.innerHeight;
      const bottom = vh - 70; // 70 — нижняя панель iPhone
      if (y < EDGE) window.scrollBy(0, -speed(EDGE - y));
      else if (y > bottom - EDGE) window.scrollBy(0, speed(y - (bottom - EDGE)));
      const sc = (el.closest('[data-drag-scroll]') ?? document.querySelector('[data-drag-scroll]')) as HTMLElement | null;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (y > r.top && y < r.bottom) {
          if (x < r.left + EDGE) sc.scrollLeft -= speed(r.left + EDGE - x);
          else if (x > r.right - EDGE) sc.scrollLeft += speed(x - (r.right - EDGE));
        }
      }
      setOver(findTarget());
      raf = requestAnimationFrame(autoScroll);
    };

    const start = () => {
      if (started) return;
      started = true;
      active = true;
      navigator.vibrate?.(12);
      // «Призрак» — копия карточки под пальцем
      ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('id');
      // Framer Motion держит конечные opacity/transform в Web Animations, а в инлайн-стиле остаются начальные
      // (opacity: 0) — копия была бы невидимой. Берём видимое состояние.
      ghost.querySelectorAll<HTMLElement>('[style]').forEach((n) => { n.style.opacity = ''; n.style.transform = ''; });
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, {
        position: 'fixed', left: '0', top: '0', width: `${rect.width}px`, margin: '0', zIndex: '200',
        pointerEvents: 'none', opacity: '0.95', borderRadius: '1rem',
        boxShadow: '0 18px 40px -10px rgba(0,0,0,.5)', background: 'var(--bg)',
        transform: `translate(${x - offX}px, ${y - offY}px) scale(1.03) rotate(-1deg)`,
        transition: 'transform 0s',
      });
      document.body.appendChild(ghost);
      el.setAttribute('data-drag-source', '');
      document.documentElement.classList.add('is-dragging');
      raf = requestAnimationFrame(autoScroll);
    };

    // Палец: ждём долгое нажатие
    const timer = touch ? window.setTimeout(start, LONG_PRESS_MS) : 0;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX; y = ev.clientY;
      if (!started) {
        const dist = Math.hypot(x - startX, y - startY);
        if (touch && dist > TOUCH_SLOP) return cleanup(); // листает
        if (!touch && dist > MOUSE_SLOP) start();
        return;
      }
      if (ghost) ghost.style.transform = `translate(${x - offX}px, ${y - offY}px) scale(1.03) rotate(-1deg)`;
      setOver(findTarget());
    };

    // Пока тащим — запрещаем прокрутку страницы пальцем (иначе iOS отменит жест)
    const onTouchMove = (ev: TouchEvent) => { if (started) ev.preventDefault(); };
    // Долгое нажатие не должно открывать системное меню / выделение текста
    const onContext = (ev: Event) => { if (touch) ev.preventDefault(); };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const target = started ? findTarget() : null;
      const key = target?.getAttribute('data-drop');
      if (started) {
        suppressClick.current = true; // клик после перетаскивания не должен открывать карточку
        setTimeout(() => { suppressClick.current = false; }, 400);
      }
      cleanup();
      if (key) dropRef.current(key);
    };

    function cleanup() {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('contextmenu', onContext);
      setOver(null);
      ghost?.remove();
      el.removeAttribute('data-drag-source');
      document.documentElement.classList.remove('is-dragging');
      active = false;
    }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) cleanup(); };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('contextmenu', onContext);
  };

  return {
    onPointerDown,
    onClickCapture: (e: RMouseEvent) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } },
    'data-draggable': disabled ? undefined : '',
  };
}
