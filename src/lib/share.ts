// Сохранение файла: на iPhone — системное «Поделиться» (→ «Сохранить в Файлы» / iCloud Drive / Telegram),
// на ноутбуке — обычная загрузка.

export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  // iPadOS притворяется Mac — узнаём по сенсорному экрану
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Скачать файл обычной ссылкой */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Поделиться файлом (на телефоне) или скачать его.
 * Возвращает 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareOrDownload(file: File, title?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (isMobile() && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title ?? file.name });
      return 'shared';
    } catch (e) {
      // Пользователь закрыл окно «Поделиться» — ничего не скачиваем
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadFile(file);
  return 'downloaded';
}
