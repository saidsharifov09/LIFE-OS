// Серверная функция life-os целиком на поддельном Supabase: подписка → расписание → будильник → отправка.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { b64url, handle } from '../../supabase/functions/life-os/index';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const pushed: { endpoint: string }[] = [];
let pushStatus = 201;

/** Мини-PostgREST: eq/lte/lt фильтры, upsert с ignore/merge, PATCH с return=representation */
function filters(q: URLSearchParams) {
  const out: ((r: Row) => boolean)[] = [];
  for (const [k, v] of q) {
    if (['select', 'on_conflict'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    const norm = (x: unknown) => (typeof x === 'boolean' ? String(x) : x);
    if (op === 'eq') out.push((r) => String(norm(r[k])) === val);
    if (op === 'lte') out.push((r) => String(r[k]) <= val);
    if (op === 'lt') out.push((r) => String(r[k]) < val);
  }
  return (r: Row) => out.every((f) => f(r));
}

const fakeFetch = vi.fn(async (input: string, init: RequestInit = {}) => {
  const url = new URL(input);
  if (url.pathname === '/auth/v1/user') {
    const a = (init.headers as Record<string, string>).Authorization;
    return a === 'Bearer user-a' ? Response.json({ id: 'a', email: 'a@x.ru' }) : new Response('{}', { status: 401 });
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const t = url.pathname.slice(9);
    const rows = (tables[t] ??= []);
    const f = filters(url.searchParams);
    const prefer = String((init.headers as Record<string, string>).Prefer ?? '');
    const method = init.method ?? 'GET';
    if (method === 'GET') return Response.json(rows.filter(f));
    if (method === 'DELETE') { tables[t] = rows.filter((r) => !f(r)); return new Response(''); }
    if (method === 'PATCH') {
      const changed = rows.filter(f);
      changed.forEach((r) => Object.assign(r, JSON.parse(String(init.body))));
      return Response.json(prefer.includes('representation') ? changed : []);
    }
    if (method === 'POST') {
      const keys = (url.searchParams.get('on_conflict') ?? 'key').split(',');
      for (const item of [].concat(JSON.parse(String(init.body)))) {
        const ex = rows.find((r) => keys.every((k) => r[k] === (item as Row)[k]));
        if (!ex) rows.push(item);
        else if (prefer.includes('merge')) Object.assign(ex, item);
      }
      return new Response('', { status: 201 });
    }
  }
  if (url.host === 'push.example') { pushed.push({ endpoint: input }); return new Response(null, { status: pushStatus }); }
  throw new Error('unexpected ' + input);
});

async function call(body: Row, headers: Record<string, string> = { Authorization: 'Bearer user-a', apikey: 'pk' }) {
  const r = await handle(new Request('https://p.supabase.co/functions/v1/life-os', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() as Row };
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  pushed.length = 0;
  pushStatus = 201;
  vi.stubGlobal('fetch', fakeFetch);
  vi.stubGlobal('Deno', { env: { get: (k: string) => ({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJservice' } as Record<string, string>)[k] } });
});

async function subscription() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  return { endpoint: 'https://push.example/sub/1', keys: { p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) } };
}

describe('функция life-os: уведомления', () => {
  it('ключ VAPID создаётся один раз', async () => {
    const k1 = await call({ action: 'push-key' });
    const k2 = await call({ action: 'push-key' });
    expect(k1.status).toBe(200);
    expect(k1.body.publicKey).toBe(k2.body.publicKey);
    expect(tables.push_config).toHaveLength(1);
  });

  it('без входа и без секрета будильника — отказ', async () => {
    expect((await call({ action: 'push-key' }, { Authorization: 'Bearer bad', apikey: 'pk' })).status).toBe(401);
    tables.push_config = [{ key: 'cron', value: 's3cret' }];
    expect((await call({ action: 'push-tick' }, { 'x-cron-secret': 'wrong' })).status).toBe(403);
  });

  it('подписка → расписание → будильник присылает только созревшее и только один раз', async () => {
    tables.push_config = [{ key: 'cron', value: 's3cret' }];
    await call({ action: 'push-subscribe', subscription: await subscription() });
    expect(tables.push_subscriptions[0]).toMatchObject({ user_id: 'a', endpoint: 'https://push.example/sub/1' });
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    const sync = await call({ action: 'push-sync', items: [
      { id: 'due', fireAt: past, title: 'Life OS', body: '⏰' },
      { id: 'later', fireAt: future, title: 'Life OS' },
      { id: 'stale', fireAt: old, title: 'Life OS' },
    ] });
    expect(sync.body.count).toBe(3);
    const tick = await call({ action: 'push-tick' }, { 'x-cron-secret': 's3cret' });
    expect(tick.body).toEqual({ due: 2, sent: 1 }); // «stale» старше часа — не шлём задним числом
    expect(pushed).toHaveLength(1);
    expect((await call({ action: 'push-tick' }, { 'x-cron-secret': 's3cret' })).body).toEqual({ due: 0, sent: 0 });
    // Повторная отправка расписания не воскрешает уже отправленное
    await call({ action: 'push-sync', items: [{ id: 'due', fireAt: past, title: 'Life OS' }] });
    expect((await call({ action: 'push-tick' }, { 'x-cron-secret': 's3cret' })).body).toEqual({ due: 0, sent: 0 });
  });

  it('устаревшая подписка (410) удаляется; тест сообщает, сколько дошло', async () => {
    await call({ action: 'push-subscribe', subscription: await subscription() });
    expect((await call({ action: 'push-test' })).body).toEqual({ ok: true, sent: 1 });
    pushStatus = 410;
    expect((await call({ action: 'push-test' })).body).toEqual({ ok: false, sent: 0 });
    expect(tables.push_subscriptions).toEqual([]);
  });

  it('нет таблиц — понятная ошибка «выполните SQL»', async () => {
    fakeFetch.mockImplementationOnce(async (input: string) => (new URL(input).pathname === '/auth/v1/user' ? Response.json({ id: 'a' }) : new Response('{}')));
    fakeFetch.mockImplementationOnce(async () => new Response('{"message":"relation \\"public.push_config\\" does not exist"}', { status: 404 }));
    const r = await call({ action: 'push-key' });
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('setup');
  });
});
