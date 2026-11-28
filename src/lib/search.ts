// Поиск по тексту: нормализация, совпадение всех слов запроса, оценка и фрагмент с найденным словом.
// Чистые функции без базы — их легко тестировать (src/lib/search.test.ts).

/** Нижний регистр, «ё» → «е», лишние пробелы убраны */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Слова запроса (без пустых и без одиночных знаков препинания) */
export function tokenize(q: string): string[] {
  return normalize(q).split(' ').map((t) => t.replace(/^[«»"'.,!?;:()]+|[«»"'.,!?;:()]+$/g, '')).filter(Boolean);
}

/**
 * Варианты слова для поиска «без окончаний»: «встречи» найдёт «встреча», «книгу» — «книга».
 * Обрезаем 1–2 буквы только у длинных слов, чтобы не находить лишнего.
 */
export function stems(token: string): string[] {
  const out = [token];
  if (/^[а-я]+$/.test(token)) {
    if (token.length >= 5) out.push(token.slice(0, -1));
    if (token.length >= 7) out.push(token.slice(0, -2));
  }
  return out;
}

export interface SearchFields {
  /** Главное поле (название) — совпадения в нём весят больше */
  title: string;
  /** Остальной текст: описание, заметки, теги, суммы… */
  text?: string;
}

/**
 * Оценка совпадения. 0 — не подходит (какое-то слово запроса не найдено нигде).
 * Чем больше — тем выше в списке.
 */
export function scoreMatch(tokens: string[], f: SearchFields): number {
  if (!tokens.length) return 0;
  const title = normalize(f.title);
  const all = title + ' \n ' + normalize(f.text ?? '');
  let score = 0;
  for (const t of tokens) {
    const variants = stems(t);
    const exact = all.includes(t);
    const loose = exact || variants.some((v) => all.includes(v));
    if (!loose) return 0;
    if (title.includes(t)) score += 12;
    else if (variants.some((v) => title.includes(v))) score += 8;
    else score += exact ? 4 : 2;
    // Слово с начала слова в названии — ещё выше
    if (new RegExp(`(^|[^а-яa-z0-9])${escapeRe(t)}`).test(title)) score += 4;
  }
  const phrase = tokens.join(' ');
  if (title === phrase) score += 40;
  else if (title.startsWith(phrase)) score += 25;
  else if (title.includes(phrase)) score += 12;
  return score;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Фрагмент текста вокруг первого найденного слова (для подписи под результатом).
 * Возвращает пустую строку, если в тексте совпадений нет.
 */
export function snippet(text: string | undefined, tokens: string[], radius = 40): string {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  const norm = normalize(flat);
  let pos = -1;
  for (const t of tokens) {
    for (const v of stems(t)) {
      const p = norm.indexOf(v);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
  }
  if (pos < 0) return '';
  const start = Math.max(0, pos - radius);
  const end = Math.min(flat.length, pos + radius * 2);
  return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '');
}

/**
 * Разбить строку на куски для подсветки совпадений: [{ text, hit }].
 * Регистр и «ё» не важны; длина нормализованного текста совпадает с исходной (ё→е — один символ).
 */
export function highlight(text: string, tokens: string[]): { text: string; hit: boolean }[] {
  if (!tokens.length || !text) return [{ text, hit: false }];
  const norm = text.toLowerCase().replace(/ё/g, 'е');
  const marks = new Array(text.length).fill(false);
  for (const t of tokens) {
    // Подсвечиваем самый длинный вариант слова, который нашёлся
    const v = stems(t).find((x) => norm.includes(x));
    if (!v) continue;
    let i = norm.indexOf(v);
    while (i >= 0) {
      for (let k = i; k < i + v.length; k++) marks[k] = true;
      i = norm.indexOf(v, i + v.length);
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else out.push({ text: text[i], hit: marks[i] });
  }
  return out;
}
