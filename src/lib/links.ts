// Ссылки в тексте: найти, подписать, угадать вид («видео», «статья»…) для «Посмотреть позже».
import type { LaterKind } from '@/db/types';

const URL_RE = /\bhttps?:\/\/[^\s<>"'«»]+/gi;

/** Все ссылки из текста без повторов; знаки препинания в конце отрезаются */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(URL_RE) ?? []) {
    let u = m.replace(/[.,;:!?…]+$/, '');
    // Закрывающая скобка без открывающей — не часть ссылки: «(см. https://a.ru)»
    while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/** Короткая подпись ссылки: «youtube.com/watch» */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const short = path.length > 24 ? path.slice(0, 23) + '…' : path;
    return host + (short && short !== '/' ? short : '');
  } catch {
    return url;
  }
}

/** Безопасно ли открывать (только http/https) */
export function isSafeUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** Вид записи по ссылке и тексту — только подсказка, пользователь может поменять */
export function guessLaterKind(text: string, url?: string): LaterKind {
  const s = `${text} ${url ?? ''}`.toLowerCase();
  // \b в JS не понимает кириллицу — начало слова ищем через «перед ним не буква»
  const w = (stem: string) => new RegExp(`(?<![а-яёa-z])${stem}`).test(s);
  if (/youtu\.?be|vimeo|rutube|tiktok|twitch|vk\.com\/video|vkvideo/.test(s) || w('видео') || w('лекци') || w('ролик')) return 'video';
  if (/kinopoisk|imdb\.com/.test(s) || w('фильм') || w('кино') || w('мульт')) return 'movie';
  if (w('сериал')) return 'series';
  if (/litres|goodreads/.test(s) || w('книг')) return 'book';
  if (/habr\.com|medium\.com|vc\.ru/.test(s) || w('стать')) return 'article';
  return url ? 'link' : 'other';
}

/** Название из текста: без ссылки; если ничего не осталось — подпись ссылки */
export function titleWithoutUrl(text: string, url?: string): string {
  const t = (url ? text.replace(url, '') : text).replace(URL_RE, '').replace(/\s+/g, ' ').trim();
  return t || (url ? linkLabel(url) : text.trim());
}
