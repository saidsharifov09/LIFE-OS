// Сжатие изображений для заметок: до 1280 px по длинной стороне, JPEG ~0.72.
// Фото с iPhone (3–5 МБ) превращается в ~150–300 КБ — база и синхронизация не разбухают.

export const IMAGE_MAX_SIDE = 1280;
export const IMAGE_QUALITY = 0.72;
/** Не больше стольких изображений в одной заметке */
export const IMAGES_PER_NOTE = 6;

/** Размер после уменьшения с сохранением пропорций (не увеличиваем) */
export function fitSize(w: number, h: number, max = IMAGE_MAX_SIDE): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Примерный размер data URL в байтах */
export function dataUrlBytes(data: string): number {
  const i = data.indexOf(',');
  return Math.floor(((data.length - i - 1) * 3) / 4);
}

/** Сжать файл-картинку в JPEG data URL (только в браузере) */
export async function compressImage(file: Blob): Promise<{ data: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Не удалось открыть изображение'));
      el.src = url;
    });
    // naturalWidth уже учитывает поворот EXIF в современных Safari/Chrome
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
    if (!w) throw new Error('Пустое изображение');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Браузер не умеет сжимать изображения');
    ctx.fillStyle = '#fff'; // прозрачный PNG → белый фон, а не чёрный
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL('image/jpeg', IMAGE_QUALITY), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
