// Уровень 1 «Без ИИ»: разбор фраз на русском по шаблонам. Работает всегда и офлайн.
// Чистая функция без базы: текст → Interpretation (шаги + вопрос). Имена людей/привычек/задач остаются текстом,
// их ищет resolve.ts. Даты, время и суммы — общим парсером быстрого захвата (src/lib/parse.ts).
import type { DateStr } from '@/db/types';
import { guessCategory } from '@/lib/categories';
import { addDays, addMonths, endOfMonth, fromDateStr, startOfMonth, startOfWeek, today as todayFn } from '@/lib/dates';
import { parseCapture } from '@/lib/parse';
import type { Interpretation, PlanStep, Query } from './plan';

const URL_RE = /https?:\/\/\S+/i;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
/** Убрать из начала служебные слова (повторно, пока что-то убирается) */
function stripLead(s: string, re: RegExp): string {
  let prev = '';
  let cur = s.trim();
  while (cur !== prev) { prev = cur; cur = cur.replace(re, '').trim(); }
  return cur;
}
/** Убрать хвостовые знаки */
const trimPunct = (s: string) => s.replace(/^[\s,.:;—-]+|[\s,.:;!?—-]+$/g, '');

const LEAD_COMMAND = /^(пожалуйста|добавь|добавить|создай|создать|запланируй|запланировать|поставь|сделай|запиши|записать|внеси|мне|новую|новая|новое|новый)[\s,:]+/i;

// ---------- Вопросы ----------
const MONTH_WORDS: [RegExp, number][] = [
  [/январ/, 0], [/феврал/, 1], [/март/, 2], [/апрел/, 3], [/ма[йя]/, 4], [/июн/, 5],
  [/июл/, 6], [/август/, 7], [/сентябр/, 8], [/октябр/, 9], [/ноябр/, 10], [/декабр/, 11],
];

function moneyPeriod(t: string, base: DateStr): { from: DateStr; to: DateStr } {
  if (/сегодня/.test(t)) return { from: base, to: base };
  if (/вчера/.test(t)) return { from: addDays(base, -1), to: addDays(base, -1) };
  if (/прошл\S* недел/.test(t)) { const s = addDays(startOfWeek(base), -7); return { from: s, to: addDays(s, 6) }; }
  if (/недел/.test(t)) return { from: startOfWeek(base), to: base };
  if (/прошл\S* месяц/.test(t)) { const s = addMonths(startOfMonth(base), -1); return { from: s, to: endOfMonth(s) }; }
  if (/(?<![а-я])год/.test(t)) return { from: `${base.slice(0, 4)}-01-01`, to: base };
  for (const [re, m] of MONTH_WORDS) {
    if (re.test(t.replace(/месяц/g, ''))) {
      let y = fromDateStr(base).getFullYear();
      const s = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      if (s > base) y -= 1;
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const to = endOfMonth(from);
      return { from, to: to > base ? base : to };
    }
  }
  return { from: startOfMonth(base), to: base };
}

function asQuery(text: string, base: DateStr): Query | null {
  const t = low(text);
  // «сколько я потратил за неделю?», «траты в этом месяце», «сколько заработал в ноябре»
  if (/(сколько|какие|мои|покажи)(?![а-яa-z0-9]).*(потратил|трат|расход|ушло|заработал|доход|получил)/.test(t) || /^(траты|расходы|доходы)(?![а-яa-z0-9])/.test(t)) {
    return { type: 'money', ...moneyPeriod(t, base) };
  }
  // «у кого скоро день рождения?», «ближайшие дни рождения»
  if (/(дн[яи]|день) рождени|(?<![а-я])др(?![а-я])/.test(t) && /(у кого|когда|скоро|ближайш|кто|какие|в этом месяце|на неделе)/.test(t)) {
    return { type: 'birthdays', days: /недел/.test(t) ? 7 : 30 };
  }
  // «найди заметку про отпуск», «где мой пароль от wifi»
  const s = t.match(/^(найди|найти|поищи|поиск|где)\s+(.+)/);
  if (s) {
    const q = trimPunct(stripLead(s[2], /^(мне|мою|мой|моя|мои|заметку|заметки|запись|записи|задачу|задачи|все|всё|про|о|об)\s+/));
    return q ? { type: 'search', text: q } : null;
  }
  // «что просрочено?», «какие задачи просрочены»
  if (/просроч/.test(t) && /(что|какие|покажи|есть ли|сколько)/.test(t)) return { type: 'overdue' };
  // «что у меня завтра?», «какие планы на пятницу», «расписание на сегодня», «что на неделе»
  const isDayQ = /^(что|чем|какие|какой|какая|покажи|расскажи)(?![а-яa-z0-9]).*(у меня|план|дела|задач|событи|в календаре|расписани|запланирован|занят|на (сегодня|завтра|послезавтра|недел)|сегодня|завтра)/.test(t)
    || /^(планы|дела|расписание|задачи|события|план)\s+на(?![а-яa-z0-9])/.test(t)
    || /^(я )?(свобод|занят)\S*(?![а-яa-z0-9]).*\?/.test(t);
  if (isDayQ) {
    if (/недел/.test(t)) return { type: 'week', from: /следующ/.test(t) ? addDays(startOfWeek(base), 7) : startOfWeek(base) };
    const h = parseCapture(text, base);
    return { type: 'day', date: h.date ?? base };
  }
  return null;
}

// ---------- Здоровье ----------
const NUM_WORDS: Record<string, number> = { один: 1, одну: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };
const toNum = (w: string | undefined) => (w === undefined ? undefined : /^\d+([.,]\d+)?$/.test(w) ? Number(w.replace(',', '.')) : NUM_WORDS[w]);

const MOOD_WORDS: [RegExp, number][] = [
  [/(отличн|супер|прекрасн|замечательн)/, 5], [/(хорош)/, 4], [/(нормальн|норм|средн|так себе)/, 3],
  [/(плох|грустн|устал)/, 2], [/(ужасн|отвратительн)/, 1],
];

const WORKOUTS: [RegExp, string][] = [
  [/(бег|пробежк|бегал)/, 'Бег'], [/(зал|качал|силов)/, 'Зал'], [/(йог)/, 'Йога'], [/(плава|бассейн)/, 'Плавание'],
  [/(велосипед|вело|катал)/, 'Велосипед'], [/(ходьб|гулял|прогулк|шаг)/, 'Прогулка'], [/(растяжк)/, 'Растяжка'],
  [/(футбол)/, 'Футбол'], [/(тренировк|тренировал|спорт|зарядк)/, 'Тренировка'],
];

function healthSteps(text: string, base: DateStr): PlanStep[] {
  const t = low(text);
  const out: PlanStep[] = [];
  const h = parseCapture(text, base);
  const date = h.date && h.date !== base ? h.date : undefined;
  // «выпил 2 стакана воды», «выпил стакан воды», «+1 вода»
  const w = t.match(/выпил\S*\s+(\d+|[а-я]+)?\s*(стакан\S*|литр\S*|пол-?литра)?\s*воды/) ?? t.match(/^\+?(\d+)\s*(стакан\S*)?\s*воды?$/);
  if (w) {
    let n = toNum(w[1]) ?? 1;
    if (w[2]?.startsWith('литр')) n *= 4;
    if (w[2] && /пол-?литра/.test(w[2])) n = 2;
    out.push({ action: 'addWater', args: { glasses: Math.max(1, Math.min(20, Math.round(n))) } });
  }
  const health: { sleep?: number; weight?: number; mood?: number } = {};
  // «спал 7 часов», «сон 6.5», «поспал 8 ч»
  const s = t.match(/(?:спал\S*|сон|поспал\S*)\s+(\d+(?:[.,]\d)?|[а-я]+)\s*(?:час|ч(?![а-яa-z0-9]))?/);
  if (s && toNum(s[1]) !== undefined && toNum(s[1])! <= 24) health.sleep = toNum(s[1]);
  // «вес 72.5», «вешу 70 кг», «взвесился 71»
  const wt = t.match(/(?:вес|вешу|взвесил\S*)\s*:?\s*(\d+(?:[.,]\d+)?)/);
  if (wt) health.weight = Number(wt[1].replace(',', '.'));
  // «настроение 4», «настроение отличное»
  const md = t.match(/настроени\S*\s*:?\s*(\d)/);
  if (md && Number(md[1]) >= 1 && Number(md[1]) <= 5) health.mood = Number(md[1]);
  else if (/настроени/.test(t)) { const f = MOOD_WORDS.find(([re]) => re.test(t)); if (f) health.mood = f[1]; }
  if (Object.keys(health).length) out.push({ action: 'setHealth', args: { ...health, ...(date ? { date } : {}) } });
  // «бегал 30 минут», «тренировка в зале 1 час», «йога 20 мин»
  const wk = t.match(/(\d+(?:[.,]\d)?)\s*(мин\S*|час\S*|ч(?![а-яa-z0-9]))/);
  const kind = WORKOUTS.find(([re]) => re.test(t));
  if (wk && kind && !/(через|в)\s+\d+\s*(мин|час)/.test(t)) {
    const n = Number(wk[1].replace(',', '.'));
    const minutes = /^ч/.test(wk[2]) ? Math.round(n * 60) : Math.round(n);
    if (minutes > 0 && minutes <= 600) out.push({ action: 'addWorkout', args: { kind: kind[1], minutes, ...(date ? { date } : {}) } });
  }
  return out;
}

// ---------- Люди ----------
/** «маме» → «маме» (как написано). Поиск человека по основе имени — в resolve.ts */
function personWord(s: string) { return trimPunct(s.split(/\s+/)[0] ?? ''); }

function peopleStep(text: string, base: DateStr): PlanStep | null {
  const t = low(text);
  // «обсудить с мамой поездку», «поговорить с Али о работе», «спросить у Зарины про рецепт», «рассказать маме про отпуск»
  let m = t.match(/^(?:надо |нужно |не забыть )?(?:обсудить|поговорить|обговорить)\s+с\s+(\S+)\s+(?:о|об|про|насчет)?\s*(.+)/)
    ?? t.match(/^(?:надо |нужно |не забыть )?(?:спросить)\s+у\s+(\S+)\s+(?:о|об|про|насчет)?\s*(.+)/)
    ?? t.match(/^(?:надо |нужно |не забыть )?(?:рассказать|сказать|показать)\s+(\S+)\s+(?:о|об|про|что|насчет)\s+(.+)/);
  if (m) {
    const offset = text.toLowerCase().replace(/ё/g, 'е').indexOf(m[2]);
    const topic = trimPunct(offset >= 0 ? text.slice(offset, offset + m[2].length) : m[2]);
    const person = personWord(text.slice(t.indexOf(m[1]), t.indexOf(m[1]) + m[1].length));
    if (topic && person) return { action: 'addTopic', args: { person, text: cap(topic) } };
  }
  // «созвонился с Зариной», «позвонил маме», «виделся с Али вчера»
  m = t.match(/^(?:сегодня |вчера )?(?:созвонил\S*|позвонил\S*|списал\S*|переписывал\S*|виделс\S*|видел\S*|встретил\S*|написал\S*|общал\S*)\s+(?:с|со)?\s*(\S+)\s*(?:сегодня|вчера)?\s*$/);
  if (m) {
    const idx = t.indexOf(m[1]);
    const h = parseCapture(text, base);
    return { action: 'markContact', args: { person: personWord(text.slice(idx, idx + m[1].length)), ...(h.date && h.date !== base ? { date: h.date } : {}) } };
  }
  return null;
}

// ---------- Основной разбор одной команды ----------
const EVENT_WORDS = /(встреч|созвон|звонок|при[её]м|свидани|собрани|совещани|планерк|урок|занятие|лекци|семинар|вебинар|тренировк|ужин с|обед с|завтрак с|вечеринк|событи|в календарь|концерт|кино|театр|матч|экзамен|интервью|собеседовани|консультаци|презентаци|стрижк|маникюр|к врачу|у врача)/;
const MONEY_VERBS = /(потратил|потратила|купил|купила|заплатил|заплатила|оплатил|оплатила|расход|отдал за|ушло на|траты?|списал[иа]?)/;
const INCOME_VERBS = /(получил|получила|зарплат|доход|заработал|заработала|пришл[аио]|перевели мне|аванс|премия|кэшбек|кешбэк)/;
const NOMINATIVE: Record<string, string> = {
  встречу: 'Встреча', тренировку: 'Тренировка', вечеринку: 'Вечеринка', планерку: 'Планёрка', планёрку: 'Планёрка',
  консультацию: 'Консультация', презентацию: 'Презентация', лекцию: 'Лекция', стрижку: 'Стрижка', запись: 'Запись',
};

function eventTitle(clean: string): string {
  let s = stripLead(clean, new RegExp(LEAD_COMMAND.source + '|^(событие|в календарь)[\\s,:]+', 'i'));
  s = trimPunct(s.replace(/\s*в календарь\s*/i, ' '));
  const [first, ...rest] = s.split(' ');
  const fixed = NOMINATIVE[low(first ?? '')];
  return fixed ? [fixed, ...rest].join(' ') : cap(s);
}

function one(text: string, base: DateStr): Interpretation {
  const t = low(text).trim();
  const h = parseCapture(text, base);
  const clean = trimPunct(h.cleanText ?? text);

  // Вопросы — только чтение, отвечаем из базы на устройстве
  const q = asQuery(text, base);
  if (q) return { steps: [], query: q };

  // «перенеси невыполненное на субботу», «перенеси всё на завтра»
  if (/^(перенеси|перенести|сдвинь|передвинь)(?![а-яa-z0-9])/.test(t)) {
    const target = h.date ?? addDays(base, 1);
    if (/(невыполн|недодел|несдел|просроч|оставш|не сделал|все задачи|всё|все$|все на|дела на|хвосты)/.test(t)) {
      return { steps: [{ action: 'moveUnfinished', args: { from: base, to: target } }] };
    }
    // «перенеси задачу позвонить маме на пятницу»
    const m = clean.match(/^(?:перенеси|перенести|сдвинь|передвинь)\s+(?:задачу\s+)?(.+?)(?:\s+на)?$/i);
    if (m && trimPunct(m[1])) return { steps: [{ action: 'moveTask', args: { task: trimPunct(m[1]), date: target, ...(h.time ? { time: h.time } : {}) } }] };
  }

  // «сделал зарядку», «выполнил задачу купить хлеб», «отметь привычку медитация»
  const done = t.match(/^(?:я\s+)?(выполнил\S*|сделал\S*|закончил\S*|отметь|отметить|готово:?)\s+(.+)/);
  if (done && !h.amount) {
    const rest = trimPunct(text.slice(text.toLowerCase().indexOf(done[2].slice(0, 3)))).replace(/^(задачу|задача|привычку|привычка)\s+/i, '');
    const isTask = /(?<![а-я])задач/.test(done[2]);
    const restNoDate = trimPunct(rest.replace(/\s+(сегодня|вчера)$/i, ''));
    if (restNoDate) {
      return { steps: [isTask ? { action: 'completeTask', args: { task: restNoDate } } : { action: 'checkHabit', args: { habit: restNoDate, ...(h.date && h.date !== base ? { date: h.date } : {}) } }] };
    }
  }

  // Здоровье: вода, сон, вес, настроение, тренировки
  const hs = healthSteps(text, base);
  if (hs.length) return { steps: hs };

  // Люди: «обсудить с мамой…», «созвонился с Зариной»
  const ps = peopleStep(text, base);
  if (ps) return { steps: [ps] };

  // История: «сегодня был в парке с Али», «узнал, что…», «запиши в историю…»
  if (/^(запиши |добавь )?(в историю|в дневник)[\s:,]/.test(t) || /^(сегодня |вчера )?(был|была|были|ходил|ходила|ездил|ездила|узнал|узнала|решил|решила|понял|поняла|гулял|гуляла)(?![а-яa-z0-9])/.test(t)) {
    const body = trimPunct(text.replace(/^(запиши |добавь )?(в историю|в дневник)[\s:,]+/i, ''));
    return { steps: [{ action: 'addLogEntry', args: { text: cap(body), ...(h.date && h.date !== base ? { date: h.date } : {}) } }] };
  }

  // «Посмотреть позже»: ссылка или «посмотреть фильм …»
  const url = text.match(URL_RE)?.[0];
  if (url || /^(посмотреть|почитать|прочитать|глянуть|послушать)\s+(позже|потом|фильм|сериал|книгу|статью|видео|подкаст)/.test(t)) {
    const title = trimPunct(text.replace(URL_RE, '').replace(/^(добавь\s+)?(в\s+)?(посмотреть|почитать|прочитать|глянуть|послушать)\s+(позже|потом)[\s:,]*/i, '')) || url || text;
    return { steps: [{ action: 'addLater', args: { title: title === url ? title : cap(title), ...(url ? { url } : {}) } }] };
  }

  // Заметка: «запиши идею: …», «заметка …», «запомни …»
  const note = text.match(/^(?:запиши|запомни|сохрани|добавь)?\s*(?:идею|идея|заметку|заметка|мысль|в блокнот)[\s:,—-]+(.+)$/i)
    ?? text.match(/^(?:запомни)[\s:,—-]+(.+)$/i);
  if (note && !(h.amount && MONEY_VERBS.test(t))) {
    const body = trimPunct(note[1]);
    const [first, ...more] = body.split(/(?<=[.!?])\s+|\n/);
    return { steps: [{ action: 'addNote', args: { title: cap(first.slice(0, 120)), ...(more.length ? { body: more.join(' ') } : {}) } }] };
  }

  // Деньги: «потратил 1200 на продукты», «кофе 250», «+50000 зарплата»
  if (h.amount) {
    const words = clean.split(/\s+/).filter(Boolean).length;
    const income = h.moneyKind === 'income' || INCOME_VERBS.test(t);
    if (MONEY_VERBS.test(t) || income || (!h.time && words <= 4 && !EVENT_WORDS.test(t))) {
      let noteText = stripLead(clean, /^(запиши|записать|добавь|расход|доход|потратил[аи]?|купил[аи]?|заплатил[аи]?|оплатил[аи]?|получил[аи]?|заработал[аи]?|отдал[аи]?|ушло|на|за|в|мне|пришл[аио])[\s,:]+/i);
      noteText = trimPunct(stripLead(noteText, /^(на|за|в)\s+/i));
      const kind = income ? 'income' : 'expense';
      const step = {
        action: income ? 'addIncome' : 'addExpense',
        args: {
          amount: h.amount, ...(h.currency ? { currency: h.currency } : {}),
          category: guessCategory(`${noteText} ${t}`, kind), ...(noteText ? { note: cap(noteText) } : {}),
          ...(h.date && h.date !== base ? { date: h.date } : {}),
        },
      } as PlanStep;
      return { steps: [step] };
    }
  }

  // Событие: есть слово-событие и дата или время
  if (EVENT_WORDS.test(t) && (h.date || h.time)) {
    return { steps: [{ action: 'addEvent', args: { title: eventTitle(clean), date: h.date ?? base, start: h.time ?? null, duration: 60 } }] };
  }

  // Задача: «напомни мне завтра позвонить маме», «добавь задачу …», «надо купить хлеб», или просто с датой/временем
  const taskLead = /^(добавь |создай |поставь |запланируй )?(задачу|задача|напомни|напомнить|надо|нужно|не забыть|не забудь|todo|туду)(?![а-яa-z0-9])/.test(t);
  if (taskLead || h.date || h.time || /^(купить|позвонить|написать|сделать|отправить|оплатить|забрать|записаться|прочитать|убрать|починить|заказать)(?![а-яa-z0-9])/.test(t)) {
    let title = stripLead(clean, new RegExp(LEAD_COMMAND.source + '|^(задачу|задача|напомни|напомнить|надо|нужно|не забыть|не забудь|todo|туду|мне|что|чтобы|о том,? что)[\\s,:]+', 'i'));
    title = trimPunct(title);
    const priority = /(срочно|важно|важная|важное)/.test(t) ? 2 : undefined;
    if (priority) title = trimPunct(title.replace(/\s*(срочно|важно|важная|важное)\s*/gi, ' '));
    if (title) {
      return { steps: [{ action: 'addTask', args: { title: cap(title), date: h.date ?? null, time: h.time ?? null, ...(priority ? { priority } : {}) } }] };
    }
  }

  // Не понял — предлагаем сохранить во «Входящие» (ничего не теряется)
  return {
    reply: 'Не понял команду. Могу сохранить это во «Входящие», разберёте потом.',
    steps: [{ action: 'capture', args: { text: text.trim() } }],
  };
}

/**
 * Разобрать сообщение. Несколько команд — с новой строки или через «;».
 * base — «сегодня» (для тестов).
 */
export function interpretRules(text: string, base: DateStr = todayFn()): Interpretation {
  const parts = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { steps: [] };
  const results = parts.map((p) => one(p, base));
  // Вопрос отвечаем, если он один; иначе берём первый вопрос и все действия
  const query = results.find((r) => r.query)?.query;
  const steps = results.flatMap((r) => r.steps);
  const understood = results.filter((r) => !r.reply);
  const reply = understood.length === results.length ? undefined : results.length === 1 ? results[0].reply : 'Часть фраз не понял — их сохраню во «Входящие».';
  return { steps, ...(query ? { query } : {}), ...(reply ? { reply } : {}) };
}
