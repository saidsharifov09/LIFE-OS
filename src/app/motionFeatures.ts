// Возможности Framer Motion (анимации, layout, жесты) — отдельный чанк, грузится сразу после первого экрана.
// Компоненты используют лёгкий `m.*` вместо `motion.*` (см. LazyMotion в App.tsx) — главный бандл меньше.
import { domMax } from 'framer-motion';
export default domMax;
