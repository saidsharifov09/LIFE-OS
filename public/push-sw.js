// Life OS — приём push-уведомлений (подключается к основному сервис-воркеру через importScripts).
// Текст приходит зашифрованным от вашей функции life-os; браузер расшифровывает его сам.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Life OS';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Напоминание',
    icon: 'pwa-192.png',
    badge: 'pwa-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '' },
  }));
});

// Нажатие на уведомление: открыть приложение на нужной записи (или переключиться на уже открытое окно)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : './', self.registration.scope).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) {
        try { if ('navigate' in c) await c.navigate(target); } catch (e) { /* другая вкладка — просто фокус */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
