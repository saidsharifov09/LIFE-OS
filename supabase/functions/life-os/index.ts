// Life OS — серверная функция в ВАШЕМ проекте Supabase (Edge Function «life-os»). Один файл — два дела:
//  1) ИИ-посредник (action "ai"): фраза → ПЛАН действий (JSON). Ничего в базе не меняет, подтверждает пользователь.
//  2) Уведомления (action "push-*"): подписка iPhone/ноутбука, расписание напоминаний и отправка Web Push
//     каждую минуту по будильнику pg_cron (SQL — в приложении: Настройки → Уведомления → «Скопировать SQL»).
// Ключи — только в секретах функции (Edge Functions → Secrets), не в коде и не в приложении.
//
// Секреты:
//   GROQ_API_KEY        — https://console.groq.com/keys   (для ИИ; можно вместо/вместе: GEMINI_API_KEY, OPENROUTER_API_KEY)
// По желанию:
//   GROQ_MODEL / GEMINI_MODEL / OPENROUTER_MODEL — сменить модель, если модель по умолчанию убрали
//   ALLOWED_EMAILS      — через запятую: кому можно пользоваться функцией (иначе — любому вошедшему в ваш проект)
// Ключи уведомлений (VAPID) функция создаёт сама при первом включении и хранит в таблице push_config.
//
// Файл самодостаточный: его можно целиком вставить в редактор функции на сайте Supabase.

// Объявление для проверки типов в репозитории (в Deno — это глобальный объект Deno)
// deno-lint-ignore no-explicit-any
declare const Deno: any;

type Provider = 'groq' | 'gemini' | 'openrouter';

const PROVIDERS: Record<Provider, { url: string; key: string; model: string; defaultModel: string }> = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: 'GROQ_API_KEY', model: 'GROQ_MODEL', defaultModel: 'llama-3.3-70b-versatile' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', defaultModel: 'gemini-flash-latest' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL', defaultModel: 'meta-llama/llama-3.3-70b-instruct:free' },
};
const ORDER: Provider[] = ['groq', 'gemini', 'openrouter'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string): string => (typeof Deno !== 'undefined' ? String(Deno.env.get(k) ?? '') : '').trim();

function systemPrompt(today: string, weekday: string): string {
  return `Ты — помощник личного приложения Life OS. Пользователь пишет по-русски. Сегодня ${today}, ${weekday}.
Твоя задача — перевести фразу в план действий. Ты НИЧЕГО не выполняешь сам: пользователь подтвердит план.
Отвечай ТОЛЬКО JSON-объектом без пояснений и без markdown:
{"reply": "короткая реплика (необязательно)", "steps": [ ... ], "query": { ... } (необязательно)}

Действия (steps), только эти:
- {"action":"addTask","args":{"title":"...","date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"priority":0|1|2}}
- {"action":"addEvent","args":{"title":"...","date":"YYYY-MM-DD","start":"HH:MM"|null,"duration":минуты}} — встречи, созвоны, приёмы
- {"action":"addExpense","args":{"amount":число,"currency":"RUB"|"TJS"|"USD","category":"food|cafe|transport|home|phone|health|clothes|fun|gifts|subs|edu|other","note":"...","date":"YYYY-MM-DD"}}
- {"action":"addIncome","args":{"amount":число,"currency":"RUB"|"TJS"|"USD","category":"salary|side|gift|other-in","note":"..."}}
- {"action":"moveUnfinished","args":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}} — перенести все невыполненные задачи с датой ≤ from
- {"action":"moveTask","args":{"task":"название задачи","date":"YYYY-MM-DD"|null,"time":"HH:MM"}}
- {"action":"completeTask","args":{"task":"название задачи"}}
- {"action":"addNote","args":{"title":"...","body":"..."}}
- {"action":"addLater","args":{"title":"...","url":"https://..."}} — посмотреть/прочитать позже
- {"action":"addLogEntry","args":{"text":"...","date":"YYYY-MM-DD"}} — запись в дневник (что было, что узнал, решения)
- {"action":"checkHabit","args":{"habit":"название привычки","date":"YYYY-MM-DD"}}
- {"action":"addWater","args":{"glasses":число}} — стаканы по 250 мл
- {"action":"setHealth","args":{"sleep":часы,"weight":кг,"mood":1-5,"date":"YYYY-MM-DD"}}
- {"action":"addWorkout","args":{"kind":"...","minutes":число}}
- {"action":"addTopic","args":{"person":"имя как в тексте","text":"что обсудить"}}
- {"action":"markContact","args":{"person":"имя как в тексте"}}
- {"action":"capture","args":{"text":"..."}} — если непонятно, сохранить во «Входящие»

Вопросы (query) — приложение ответит само из своих данных, тебе данные не нужны:
- {"type":"day","date":"YYYY-MM-DD"} — «что у меня завтра?»
- {"type":"week","from":"YYYY-MM-DD"} — понедельник нужной недели
- {"type":"money","from":"YYYY-MM-DD","to":"YYYY-MM-DD"} — «сколько я потратил…»
- {"type":"birthdays","days":30}
- {"type":"search","text":"..."}
- {"type":"overdue"}

Правила: даты считай от сегодняшней («в пятницу» — ближайшая пятница, сегодня тоже подходит). Валюта по умолчанию RUB.
Названия пиши с большой буквы в именительном падеже («Встреча с Али»). Не выдумывай того, чего нет во фразе.
Если фраза — вопрос, верни query и пустой steps. Медицинских советов не давай.`;
}

/** Достать JSON из ответа модели (бывает обёрнут в ```json) */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* ищем первый объект */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* нет */ } }
  return null;
}

class LimitError extends Error {}

async function callProvider(p: Provider, text: string, today: string, weekday: string): Promise<unknown> {
  const cfg = PROVIDERS[p];
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env(cfg.key)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env(cfg.model) || cfg.defaultModel,
      temperature: 0,
      max_tokens: 800,
      messages: [{ role: 'system', content: systemPrompt(today, weekday) }, { role: 'user', content: text }],
      ...(p === 'openrouter' ? {} : { response_format: { type: 'json_object' } }),
    }),
  });
  if (r.status === 429 || r.status === 402) throw new LimitError(`${p}: ${r.status}`);
  if (!r.ok) throw new Error(`${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content ?? '';
  const plan = extractJson(content);
  if (!plan) throw new Error(`${p}: ответ не JSON`);
  return plan;
}

/** Проверить вход пользователя: спрашиваем Auth вашего же проекта (работает со старыми и новыми ключами) */
async function getUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? env('SUPABASE_ANON_KEY');
  const base = env('SUPABASE_URL');
  if (!auth.startsWith('Bearer ') || !base) return null;
  const r = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!r.ok) return null;
  return await r.json();
}


async function handleAi(body: Record<string, unknown>): Promise<Response> {
  const text = String(body.text ?? '').slice(0, 2000).trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today ?? '')) ? String(body.today) : new Date().toISOString().slice(0, 10);
  const weekday = String(body.weekday ?? '').slice(0, 20);
  if (!text) return json({ error: 'Пустой текст' }, 400);

  // Провайдер: выбранный в приложении (если для него есть ключ), затем остальные — запасные
  const withKey = ORDER.filter((p) => env(PROVIDERS[p].key));
  if (!withKey.length) return json({ error: 'В секретах функции нет ни одного ключа ИИ', code: 'no-key' }, 500);
  const wanted = body.provider as Provider;
  const order = withKey.includes(wanted) ? [wanted, ...withKey.filter((p) => p !== wanted)] : withKey;

  let limited = 0;
  const errors: string[] = [];
  for (const p of order) {
    try {
      const plan = await callProvider(p, text, today, weekday);
      return json({ plan, provider: p });
    } catch (e) {
      if (e instanceof LimitError) limited++;
      errors.push(String((e as Error).message));
    }
  }
  if (limited === order.length) return json({ error: 'Бесплатный лимит закончился', code: 'limit' }, 429);
  // Текст фразы в журнал не пишем — только ошибки сервисов
  console.error('life-os ai:', errors.join(' | '));
  return json({ error: errors[errors.length - 1] ?? 'Ошибка ИИ', code: 'error' }, 502);
}

// =====================================================================================
// Уведомления: Web Push (RFC 8291 шифрование + VAPID RFC 8292) на встроенном WebCrypto
// =====================================================================================

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export interface Vapid { publicKey: string; privateJwk: JsonWebKey }

/** Новая пара ключей VAPID (P-256) */
export async function generateVapid(): Promise<Vapid> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
}

/** Подпись VAPID (JWT ES256) для адреса push-сервиса */
export async function vapidHeader(endpoint: string, v: Vapid, subject: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: now + 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${v.publicKey}`;
}

/** Зашифровать текст уведомления для конкретной подписки (aes128gcm, RFC 8291) */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  return concat(header, asPublic, cipher);
}

interface Sub { endpoint: string; p256dh: string; auth: string; user_id?: string }
interface Note { title: string; body: string; url?: string | null; tag?: string }

/** Отправить одно уведомление. Возвращает HTTP-статус push-сервиса (404/410 — подписка больше не действует) */
export async function sendPush(sub: Sub, note: Note, v: Vapid, subject: string, fetchFn: typeof fetch = fetch): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(note)), sub.p256dh, sub.auth);
  const r = await fetchFn(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, v, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  });
  return r.status;
}

// ---------- База: таблицы push_config, push_subscriptions, push_reminders (только ключ сервиса) ----------
function serviceKey(): string {
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}') as Record<string, string>;
    return Object.values(keys)[0] ?? '';
  } catch { return ''; }
}

async function db(method: string, path: string, body?: unknown, prefer?: string): Promise<unknown> {
  const key = serviceKey();
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) {
    if (/push_\w+/.test(t) && /does not exist|Could not find/i.test(t)) throw new SetupError();
    throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  }
  return t ? JSON.parse(t) : null;
}
class SetupError extends Error { constructor() { super('Нет таблиц уведомлений — выполните SQL из приложения (Настройки → Уведомления)'); } }

async function getConfig(key: string): Promise<string | null> {
  const rows = await db('GET', `push_config?key=eq.${key}&select=value`) as { value: string }[];
  return rows[0]?.value ?? null;
}

async function getVapid(): Promise<Vapid> {
  const saved = await getConfig('vapid');
  if (saved) return JSON.parse(saved);
  const v = await generateVapid();
  // Если два запроса создали ключи одновременно — останется первый
  await db('POST', 'push_config?on_conflict=key', { key: 'vapid', value: JSON.stringify(v) }, 'resolution=ignore-duplicates,return=minimal');
  return JSON.parse((await getConfig('vapid'))!);
}

const subject = () => env('SUPABASE_URL') || 'mailto:noreply@example.com';

async function sendToUser(userId: string, notes: Note[], v: Vapid): Promise<number> {
  const subs = await db('GET', `push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`) as Sub[];
  let ok = 0;
  for (const s of subs) {
    for (const n of notes) {
      const status = await sendPush(s, n, v, subject()).catch(() => 0);
      if (status === 404 || status === 410) { await db('DELETE', `push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`); break; }
      if (status >= 200 && status < 300) ok++;
      else console.error('life-os push:', status, new URL(s.endpoint).host);
    }
  }
  return ok;
}

/** Будильник (pg_cron раз в минуту): отправить созревшие напоминания */
async function pushTick(): Promise<Response> {
  const now = new Date();
  // Атомарно «забираем» созревшие: помечаем отправленными и получаем их — повторный запуск их не возьмёт
  const due = await db('PATCH', `push_reminders?sent=eq.false&fire_at=lte.${now.toISOString()}&select=user_id,id,fire_at,title,body,url`, { sent: true }, 'return=representation') as
    { user_id: string; id: string; fire_at: string; title: string; body: string; url: string | null }[];
  // Старше часа (функция не работала) — не шлём задним числом
  const fresh = due.filter((d) => now.getTime() - Date.parse(d.fire_at) < 3600_000);
  let sent = 0;
  if (fresh.length) {
    const v = await getVapid();
    const byUser = new Map<string, Note[]>();
    for (const d of fresh) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), { title: d.title, body: d.body, url: d.url, tag: d.id }]);
    for (const [u, notes] of byUser) sent += await sendToUser(u, notes, v);
  }
  // Уборка: отправленные старше 2 дней
  await db('DELETE', `push_reminders?sent=eq.true&fire_at=lt.${new Date(now.getTime() - 2 * 86400_000).toISOString()}`);
  return json({ due: due.length, sent });
}

interface ReminderIn { id: string; fireAt: string; title: string; body?: string; url?: string }

async function handlePush(action: string, body: Record<string, unknown>, userId: string): Promise<Response> {
  switch (action) {
    case 'push-key':
      return json({ publicKey: (await getVapid()).publicKey });
    case 'push-subscribe': {
      const s = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
      if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'Неверная подписка' }, 400);
      await db('POST', 'push_subscriptions?on_conflict=endpoint', { endpoint: s.endpoint, user_id: userId, p256dh: s.keys.p256dh, auth: s.keys.auth }, 'resolution=merge-duplicates,return=minimal');
      return json({ ok: true });
    }
    case 'push-unsubscribe': {
      const endpoint = String(body.endpoint ?? '');
      if (endpoint) await db('DELETE', `push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}`);
      const left = await db('GET', `push_subscriptions?user_id=eq.${userId}&select=endpoint`) as unknown[];
      // Не осталось ни одного устройства — расписание больше не нужно
      if (!left.length) await db('DELETE', `push_reminders?user_id=eq.${userId}&sent=eq.false`);
      return json({ ok: true, devices: left.length });
    }
    case 'push-sync': {
      // Приложение присылает ВСЁ будущее расписание целиком — заменяем неотправленное
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 300) as ReminderIn[];
      const rows = items
        .filter((i) => i && typeof i.id === 'string' && !Number.isNaN(Date.parse(i.fireAt)) && typeof i.title === 'string')
        .map((i) => ({ user_id: userId, id: i.id.slice(0, 200), fire_at: new Date(i.fireAt).toISOString(), title: i.title.slice(0, 120), body: String(i.body ?? '').slice(0, 240), url: i.url ? String(i.url).slice(0, 300) : null, sent: false }));
      await db('DELETE', `push_reminders?user_id=eq.${userId}&sent=eq.false`);
      if (rows.length) {
        // Уже отправленные с тем же id не трогаем (ignore-duplicates) — чтобы не прислать дважды
        await db('POST', 'push_reminders?on_conflict=user_id,id', rows, 'resolution=ignore-duplicates,return=minimal');
      }
      return json({ ok: true, count: rows.length });
    }
    case 'push-test': {
      const n = await sendToUser(userId, [{ title: 'Life OS', body: 'Уведомления работают ✓', url: '#/settings', tag: 'test' }], await getVapid());
      return json({ ok: n > 0, sent: n });
    }
    default:
      return json({ error: 'Неизвестное действие' }, 400);
  }
}

async function cronAllowed(req: Request): Promise<boolean> {
  const got = req.headers.get('x-cron-secret') ?? '';
  if (!got) return false;
  const want = await getConfig('cron');
  return !!want && got === want;
}

// =====================================================================================
// Вход
// =====================================================================================
export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Неверный запрос' }, 400); }
  const action = String(body.action ?? 'ai');

  try {
    // Будильник от pg_cron — без входа пользователя, по секрету из push_config
    if (action === 'push-tick') {
      if (!(await cronAllowed(req))) return json({ error: 'Нет доступа' }, 403);
      return await pushTick();
    }

    const user = await getUser(req);
    if (!user) return json({ error: 'Нужно войти', code: 'auth' }, 401);
    const allowed = env('ALLOWED_EMAILS').toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes((user.email ?? '').toLowerCase())) return json({ error: 'Нет доступа', code: 'forbidden' }, 403);

    if (action === 'ai') return await handleAi(body);
    if (action.startsWith('push-')) {
      if (!serviceKey()) return json({ error: 'Функции не хватает ключа сервиса Supabase', code: 'setup' }, 500);
      return await handlePush(action, body, user.id);
    }
    return json({ error: 'Неизвестное действие' }, 400);
  } catch (e) {
    if (e instanceof SetupError) return json({ error: e.message, code: 'setup' }, 500);
    console.error('life-os:', (e as Error).message);
    return json({ error: (e as Error).message, code: 'error' }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
