import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { addTask, deleteTask, emptyTrash, listTasks, setSetting, updateTask } from '@/actions';
import type { CloudApi, CloudRow, Vault } from './api';
import { getKey, resetSyncState, syncDb, syncOnce, unlock, WrongSyncPassword } from './engine';

/** Облако в памяти с теми же правилами, что SQL-схема: номер изменения и «старая правка не затирает новую» */
class FakeCloud {
  rows = new Map<string, CloudRow>();
  vault: Vault | null = null;
  seq = 0;
  api(user = 'u1'): CloudApi {
    return {
      userId: () => user,
      getVault: async () => this.vault,
      createVault: async (v) => { this.vault = v; },
      pull: async (after, limit) => [...this.rows.values()].filter((r) => r.seq! > after).sort((a, b) => a.seq! - b.seq!).slice(0, limit),
      push: async (rows) => {
        for (const r of rows) {
          const k = `${r.tbl}:${r.id}`;
          const old = this.rows.get(k);
          if (old && r.updated_at < old.updated_at) continue;
          this.rows.set(k, { ...r, seq: ++this.seq });
        }
      },
      wipe: async () => { this.rows.clear(); this.vault = null; },
    };
  }
}

/** Два «устройства» в одном процессе: сохраняем/подставляем содержимое баз */
type Snapshot = Record<string, unknown[]>;
async function snapshot(): Promise<Snapshot> {
  const s: Snapshot = {};
  for (const t of db.tables) s['db:' + t.name] = await t.toArray();
  for (const t of syncDb.tables) s['sync:' + t.name] = await t.toArray();
  return s;
}
async function load(s: Snapshot | null) {
  for (const t of db.tables) { await t.clear(); if (s) await t.bulkPut(s['db:' + t.name] as never[]); }
  for (const t of syncDb.tables) { await t.clear(); if (s) await t.bulkPut(s['sync:' + t.name] as never[]); }
}
async function asDevice(store: { snap: Snapshot | null }, fn: () => Promise<void>) {
  await load(store.snap);
  await fn();
  store.snap = await snapshot();
}

let cloud: FakeCloud;
beforeEach(async () => {
  cloud = new FakeCloud();
  await load(null);
});

const sync = async (c = cloud) => syncOnce(c.api(), (await getKey())!);

describe('синхронизация', () => {
  it('пароль: первое устройство создаёт сейф, второе проверяет пароль', async () => {
    expect(await unlock(cloud.api(), 'пароль-1')).toBe('created');
    expect(cloud.vault?.check_data).toBeTruthy();
    await resetSyncState();
    await expect(unlock(cloud.api(), 'не тот')).rejects.toBeInstanceOf(WrongSyncPassword);
    expect(await unlock(cloud.api(), 'пароль-1')).toBe('opened');
  });

  it('в облако уходит только шифротекст', async () => {
    await unlock(cloud.api(), 'пароль-1');
    await addTask({ title: 'Секретная задача' });
    await setSetting('rates', { USD: 90, TJS: 8 });
    await setSetting('lastBackupAt', 123); // настройка устройства — не синхронизируется
    const r = await sync();
    expect(r.pushed).toBe(2);
    const all = JSON.stringify([...cloud.rows.values()]);
    expect(all).not.toContain('Секретная');
    expect([...cloud.rows.values()].map((x) => x.tbl).sort()).toEqual(['settings', 'tasks']);
    // повторная синхронизация ничего не отправляет
    expect((await sync()).pushed).toBe(0);
  });

  it('iPhone ↔ ноутбук: создание, правка, «новее побеждает», удаление', async () => {
    const phone = { snap: null as Snapshot | null };
    const laptop = { snap: null as Snapshot | null };
    let id = '';

    await asDevice(phone, async () => {
      await unlock(cloud.api(), 'pw-123456');
      id = (await addTask({ title: 'Купить хлеб' })).id;
      await sync();
    });
    await asDevice(laptop, async () => {
      await unlock(cloud.api(), 'pw-123456');
      const r = await sync();
      expect(r.pulled).toBe(1);
      expect((await listTasks()).map((t) => t.title)).toEqual(['Купить хлеб']);
      await addTask({ title: 'С ноутбука' });
      await sync();
    });
    // Конфликт: сначала правит телефон (офлайн), потом ноутбук — побеждает ноутбук (новее)
    await asDevice(phone, async () => { await updateTask(id, { title: 'Хлеб (телефон)' }); });
    await new Promise((r) => setTimeout(r, 5));
    await asDevice(laptop, async () => { await updateTask(id, { title: 'Хлеб (ноутбук)' }); await sync(); });
    await asDevice(phone, async () => {
      await sync();
      const titles = (await listTasks()).map((t) => t.title).sort();
      expect(titles).toEqual(['Хлеб (ноутбук)', 'С ноутбука'].sort());
    });
    // Удаление в корзину и очистка корзины на телефоне → исчезает на ноутбуке
    await asDevice(phone, async () => { await deleteTask(id); await sync(); });
    await asDevice(laptop, async () => {
      await sync();
      expect((await listTasks()).map((t) => t.title)).toEqual(['С ноутбука']);
      expect((await db.tasks.get(id))?.deletedAt).toBeTruthy(); // лежит в корзине и тут
    });
    await asDevice(phone, async () => {
      await emptyTrash();
      await sync();
      expect(await db.tasks.get(id)).toBeUndefined(); // не воскресла из облака
      expect(cloud.rows.get(`tasks:${id}`)).toMatchObject({ deleted: true, data: null });
    });
    await asDevice(laptop, async () => {
      await sync();
      expect(await db.tasks.get(id)).toBeUndefined();
    });
    // Облако остаётся согласованным: на телефоне то же, что на ноутбуке
    const laptopTasks = (laptop.snap!['db:tasks'] as { id: string }[]).map((t) => t.id).sort();
    const phoneTasks = (phone.snap!['db:tasks'] as { id: string }[]).map((t) => t.id).sort();
    expect(phoneTasks).toEqual(laptopTasks);
  });

  it('старая правка не затирает более новую в облаке', async () => {
    await unlock(cloud.api(), 'pw-123456');
    const t = await addTask({ title: 'A' });
    await sync();
    const row = cloud.rows.get(`tasks:${t.id}`)!;
    await cloud.api().push([{ ...row, updated_at: row.updated_at - 1000, data: 'old' }]);
    expect(cloud.rows.get(`tasks:${t.id}`)!.data).toBe(row.data);
  });
});

describe('вход', () => {
  it('понимает код, ссылку из письма и адрес после перехода', async () => {
    const { parseLoginInput } = await import('./api');
    expect(parseLoginInput(' 123456 ')).toEqual({ kind: 'code', code: '123456' });
    expect(parseLoginInput('https://abc.supabase.co/auth/v1/verify?token=9f8e7d&type=magiclink&redirect_to=https://x.github.io/LIFE-OS/'))
      .toEqual({ kind: 'link', tokenHash: '9f8e7d', type: 'magiclink' });
    expect(parseLoginInput('https://abc.supabase.co/auth/v1/verify?token=aa11&type=signup')).toMatchObject({ kind: 'link', type: 'signup' });
    const payload = btoa(JSON.stringify({ sub: 'u1', email: 'a@b.c', exp: 2e9 })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const r = parseLoginInput(`https://x.github.io/LIFE-OS/#access_token=h.${payload}.s&refresh_token=rt&type=magiclink`);
    expect(r).toMatchObject({ kind: 'session', session: { user: { id: 'u1' }, refresh_token: 'rt' } });
    expect(parseLoginInput('привет')).toEqual({ kind: 'bad' });
  });
});
