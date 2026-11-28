// Life OS — ИИ-посредник (Supabase Edge Function «life-os-ai»).
// Принимает фразу из приложения, спрашивает бесплатный ИИ-сервис и возвращает ПЛАН (JSON) — ничего в базе не меняет.
// Ключи ИИ-сервисов — только в секретах функции (Edge Functions → Secrets), не в коде и не в приложении.
//
// Секреты (нужен хотя бы один ключ):
//   GROQ_API_KEY        — https://console.groq.com/keys
//   GEMINI_API_KEY      — https://aistudio.google.com/apikey
//   OPENROUTER_API_KEY  — https://openrouter.ai/keys
// По желанию:
//   GROQ_MODEL / GEMINI_MODEL / OPENROUTER_MODEL — сменить модель, если модель по умолчанию убрали
//   ALLOWED_EMAILS      — через запятую: кому можно пользоваться функцией (иначе — любому вошедшему в ваш проект)
//
// Файл самодостаточный: его можно целиком вставить в редактор функции на сайте Supabase.

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

const env = (k: string) => (Deno.env.get(k) ?? '').trim();

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: 'Нужно войти', code: 'auth' }, 401);
  const allowed = env('ALLOWED_EMAILS').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes((user.email ?? '').toLowerCase())) return json({ error: 'Нет доступа', code: 'forbidden' }, 403);

  let body: { text?: string; today?: string; weekday?: string; provider?: string };
  try { body = await req.json(); } catch { return json({ error: 'Неверный запрос' }, 400); }
  const text = String(body.text ?? '').slice(0, 2000).trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '') ? body.today! : new Date().toISOString().slice(0, 10);
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
  console.error('life-os-ai:', errors.join(' | '));
  return json({ error: errors[errors.length - 1] ?? 'Ошибка ИИ', code: 'error' }, 502);
});
