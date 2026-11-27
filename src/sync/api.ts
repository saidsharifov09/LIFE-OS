// Минимальный клиент Supabase на fetch (без supabase-js — меньше вес приложения).
// Адрес проекта и публичный ключ вводятся в Настройках и хранятся только на устройстве (localStorage).

export interface SyncConfig { url: string; anonKey: string }
export interface Session {
  access_token: string;
  refresh_token: string;
  /** Когда истекает access_token (мс) */
  expires_at: number;
  user: { id: string; email?: string };
}

/** Строка таблицы records в облаке */
export interface CloudRow {
  user_id?: string;
  tbl: string;
  id: string;
  updated_at: number;
  deleted: boolean;
  data: string | null;
  seq?: number;
}
export interface Vault { salt: string; iterations: number; check_data: string }

/** Интерфейс облака, которым пользуется движок синхронизации (в тестах — подделка в памяти) */
export interface CloudApi {
  userId(): string;
  getVault(): Promise<Vault | null>;
  createVault(v: Vault): Promise<void>;
  pull(afterSeq: number, limit: number): Promise<CloudRow[]>;
  push(rows: CloudRow[]): Promise<void>;
  wipe(): Promise<void>;
}

const CONFIG_KEY = 'lifeos.sync.config';
const SESSION_KEY = 'lifeos.sync.session';

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}
function write(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch { /* приватный режим — ничего */ }
}

export const getConfig = () => read<SyncConfig>(CONFIG_KEY);
export const setConfig = (c: SyncConfig | null) => write(CONFIG_KEY, c);
export const getSession = () => read<Session>(SESSION_KEY);
export const setSession = (s: Session | null) => write(SESSION_KEY, s);

/** Привести адрес к виду https://xxx.supabase.co (без / в конце) */
export function normalizeUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//.test(u)) u = `https://${u}`;
  return u.replace(/\/(rest|auth)\/v1.*$/, '');
}

/** Ошибка сети (нет интернета / сервер недоступен) — показываем «нет сети», а не «ошибка» */
export class OfflineError extends Error {
  constructor() { super('Нет сети'); }
}
export class AuthError extends Error {}

function toSession(j: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user: { id: string; email?: string } }): Session {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in ?? 3600) * 1000,
    user: { id: j.user.id, email: j.user.email },
  };
}

/** Разобрать вход по ссылке из письма: #access_token=…&refresh_token=… */
export function sessionFromHash(hash: string): Session | null {
  const p = new URLSearchParams(hash.replace(/^#\/?/, ''));
  const at = p.get('access_token'), rt = p.get('refresh_token');
  if (!at || !rt) return null;
  try {
    const payload = JSON.parse(atob(at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub: string; email?: string; exp: number };
    return { access_token: at, refresh_token: rt, expires_at: payload.exp * 1000, user: { id: payload.sub, email: payload.email } };
  } catch {
    return null;
  }
}

async function req(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new OfflineError();
  }
}

async function errorText(r: Response): Promise<string> {
  try {
    const j = await r.json() as { msg?: string; message?: string; error_description?: string; error?: string };
    return j.msg || j.message || j.error_description || j.error || `Ошибка ${r.status}`;
  } catch {
    return `Ошибка ${r.status}`;
  }
}

/** Понятный русский текст для частых ошибок Supabase */
export function humanAuthError(msg: string): string {
  if (/token has expired|invalid/i.test(msg) && /otp|token/i.test(msg)) return 'Код неверный или устарел. Запросите новый.';
  if (/rate limit|too many|security purposes/i.test(msg)) return 'Слишком часто. Подождите минуту и попробуйте снова.';
  if (/signups not allowed/i.test(msg)) return 'В проекте Supabase запрещена регистрация. Включите Email в Authentication → Providers.';
  if (/invalid api key|no api key/i.test(msg)) return 'Неверный публичный ключ (anon / publishable key).';
  if (/error sending|smtp|email address not authorized/i.test(msg)) return 'Supabase не смог отправить письмо. Используйте email, на который зарегистрирован проект Supabase.';
  return msg;
}

export class SupabaseApi implements CloudApi {
  constructor(private cfg: SyncConfig) {}

  private authHeaders() {
    return { apikey: this.cfg.anonKey, 'Content-Type': 'application/json' };
  }

  /** Отправить письмо с кодом (и ссылкой) для входа */
  async sendCode(email: string, redirectTo: string) {
    const r = await req(`${this.cfg.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ email, create_user: true }),
    });
    if (!r.ok) throw new AuthError(humanAuthError(await errorText(r)));
  }

  /** Подтвердить код из письма → сессия */
  async verifyCode(email: string, token: string): Promise<Session> {
    const r = await req(`${this.cfg.url}/auth/v1/verify`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ type: 'email', email, token: token.trim() }),
    });
    if (!r.ok) throw new AuthError(humanAuthError(await errorText(r)));
    const s = toSession(await r.json());
    setSession(s);
    return s;
  }

  private async refresh(): Promise<Session> {
    const s = getSession();
    if (!s) throw new AuthError('Нужно войти заново');
    const r = await req(`${this.cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!r.ok) {
      if (r.status >= 400 && r.status < 500) { setSession(null); throw new AuthError('Сессия закончилась — войдите заново'); }
      throw new Error(await errorText(r));
    }
    const ns = toSession(await r.json());
    setSession(ns);
    return ns;
  }

  private async token(): Promise<string> {
    let s = getSession();
    if (!s) throw new AuthError('Нужно войти');
    if (s.expires_at - Date.now() < 60_000) s = await this.refresh();
    return s.access_token;
  }

  async signOut() {
    const s = getSession();
    setSession(null);
    if (s) await req(`${this.cfg.url}/auth/v1/logout`, { method: 'POST', headers: { ...this.authHeaders(), Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  }

  userId() {
    const s = getSession();
    if (!s) throw new AuthError('Нужно войти');
    return s.user.id;
  }

  /** Запрос к таблицам (PostgREST) с обновлением токена при 401 */
  private async rest(method: string, path: string, body?: unknown, prefer?: string): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers: Record<string, string> = { ...this.authHeaders(), Authorization: `Bearer ${await this.token()}` };
      if (prefer) headers.Prefer = prefer;
      const r = await req(`${this.cfg.url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (r.status === 401 && attempt === 0) { await this.refresh(); continue; }
      if (!r.ok) {
        const t = await errorText(r);
        if (/relation .* does not exist|Could not find the table/i.test(t)) throw new Error('В Supabase нет таблиц Life OS — выполните SQL из инструкции (шаг 3).');
        throw new Error(t);
      }
      return r;
    }
    throw new AuthError('Сессия закончилась — войдите заново');
  }

  async getVault(): Promise<Vault | null> {
    const rows = await (await this.rest('GET', 'vault?select=salt,iterations,check_data')).json() as Vault[];
    return rows[0] ?? null;
  }

  async createVault(v: Vault) {
    await this.rest('POST', 'vault', { ...v, user_id: this.userId() }, 'return=minimal');
  }

  async pull(afterSeq: number, limit: number): Promise<CloudRow[]> {
    return (await this.rest('GET', `records?select=tbl,id,updated_at,deleted,data,seq&seq=gt.${afterSeq}&order=seq.asc&limit=${limit}`)).json();
  }

  async push(rows: CloudRow[]) {
    if (!rows.length) return;
    const uid = this.userId();
    await this.rest('POST', 'records?on_conflict=user_id,tbl,id', rows.map((r) => ({ ...r, user_id: uid, seq: undefined })), 'resolution=merge-duplicates,return=minimal');
  }

  /** «Забыл пароль»: удалить из облака все свои записи и сейф */
  async wipe() {
    const uid = this.userId();
    await this.rest('DELETE', `records?user_id=eq.${uid}`);
    await this.rest('DELETE', `vault?user_id=eq.${uid}`);
  }
}
