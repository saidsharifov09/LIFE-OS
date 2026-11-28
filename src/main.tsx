import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { autoPurgeTrash } from './actions';
import { sessionFromHash, setSession } from './sync/api';
import { startAutoSync } from './sync/auto';

// Вход в облако по ссылке из письма: Supabase возвращает #access_token=… — сохраняем и открываем настройки
if (/access_token=/.test(location.hash)) {
  const s = sessionFromHash(location.hash);
  if (s) setSession(s);
  history.replaceState(null, '', `${location.pathname}#/settings#sync`);
} else if (/error_description=/.test(location.hash)) {
  history.replaceState(null, '', `${location.pathname}#/settings#sync`);
}
import './index.css';

// Сервис-воркер: офлайн-работа и автообновление приложения.
// На iPhone приложение с экрана «Домой» обычно не перезагружается, а «просыпается» из фона —
// поэтому проверяем обновление при каждом возвращении в приложение и раз в час.
// Нашлась новая версия → autoUpdate сам перезагрузит страницу (данные в IndexedDB не трогаются).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    let last = 0;
    const check = () => {
      if (!navigator.onLine || Date.now() - last < 30_000) return;
      last = Date.now();
      reg.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    window.addEventListener('focus', check);
    setInterval(check, 60 * 60 * 1000);
  },
});

// Просим браузер не удалять локальную базу при нехватке места
navigator.storage?.persist?.().catch(() => {});

// Корзина: записи старше 30 дней удаляются при запуске
autoPurgeTrash().catch(() => {});

// Облачная синхронизация (если подключена в настройках)
startAutoSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
