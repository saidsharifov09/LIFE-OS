import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const version = `${pkg.version} · ${new Date().toISOString().slice(0, 10)}`;

// База /LIFE-OS/ — так называется репозиторий на GitHub Pages (регистр важен).
export default defineConfig({
  base: '/LIFE-OS/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // Библиотеки — отдельными файлами: они меняются редко, и после обновления приложения
        // браузер (и офлайн-кэш PWA) скачивает заново только изменившийся код приложения.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/](react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'vendor-router';
          if (/[\\/](dexie|dexie-react-hooks)[\\/]/.test(id)) return 'vendor-db';
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'vendor-icons';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Life OS',
        short_name: 'Life OS',
        description: 'Одна система для всей жизни: дела, время, деньги, здоровье, цели, заметки.',
        lang: 'ru',
        start_url: '/LIFE-OS/',
        scope: '/LIFE-OS/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/LIFE-OS/index.html',
        // Приём push-уведомлений (Настройки → Уведомления)
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
