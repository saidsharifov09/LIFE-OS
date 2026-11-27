import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { autoPurgeTrash } from './actions';
import './index.css';

// Сервис-воркер: офлайн-работа и автообновление приложения
registerSW({ immediate: true });

// Просим браузер не удалять локальную базу при нехватке места
navigator.storage?.persist?.().catch(() => {});

// Корзина: записи старше 30 дней удаляются при запуске
autoPurgeTrash().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
