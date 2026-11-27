import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  addTask, addExpense, deleteTask, listTasks, undoLast, exportAll, importBackup, listTrash, restoreFromTrash,
  purgeItem, emptyTrash, autoPurgeTrash, backupDue, markBackupDone, snoozeBackup, setSetting, updateTask,
} from './index';
import { decryptBackup, encryptBackup, parseBackupFile, WrongPasswordError } from '@/lib/backup';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const DAY = 86400000;

describe('резервная копия', () => {
  it('экспорт → «заменить» возвращает данные как были, отмена — обратно', async () => {
    await addTask({ title: 'A' });
    await addExpense({ amount: 300, note: 'Кофе', category: 'cafe' });
    await setSetting('rates', { USD: 90, TJS: 8 });
    const copy = await exportAll();
    expect(copy.schemaVersion).toBe(2);

    await addTask({ title: 'Лишняя' });
    const r = await importBackup(copy, 'replace');
    expect(r.removed).toBe(1);
    expect((await listTasks()).map((t) => t.title)).toEqual(['A']);
    expect(await db.transactions.count()).toBe(1);

    await undoLast();
    expect((await listTasks()).map((t) => t.title).sort()).toEqual(['A', 'Лишняя']);
  });

  it('«объединить»: добавляет новые, побеждает более новая правка, ничего не удаляет', async () => {
    const a = await addTask({ title: 'Старое' });
    const copy = await exportAll();
    // в копии правим задачу «позже», а на устройстве есть своя новая задача
    copy.tables.tasks[0] = { ...copy.tables.tasks[0], title: 'Новое из копии', updatedAt: Date.now() + 1000 } as never;
    copy.tables.tasks.push({ ...copy.tables.tasks[0], id: 'from-copy', title: 'Только в копии' } as never);
    await addTask({ title: 'Только тут' });

    const r = await importBackup(copy, 'merge');
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    const titles = (await listTasks()).map((t) => t.title).sort();
    expect(titles).toEqual(['Новое из копии', 'Только в копии', 'Только тут']);

    // правка на устройстве новее копии — остаётся
    await updateTask(a.id, { title: 'Свежее на устройстве' });
    const old = { ...copy, tables: { ...copy.tables, tasks: [{ ...copy.tables.tasks[0], updatedAt: 1 }] } };
    await importBackup(old as never, 'merge');
    expect((await db.tasks.get(a.id))?.title).toBe('Свежее на устройстве');
  });

  it('файл из более новой версии не импортируется', async () => {
    const copy = await exportAll();
    await expect(importBackup({ ...copy, schemaVersion: 99 }, 'merge')).rejects.toThrow(/новее|новой версии/);
    expect(() => parseBackupFile('{"hello":1}')).toThrow(/не файл копии/);
    expect(() => parseBackupFile('не json')).toThrow();
  });

  it('шифрование паролем: верный пароль открывает, неверный — нет', async () => {
    await addTask({ title: 'Секрет' });
    const copy = await exportAll();
    const enc = await encryptBackup(copy, 'пароль-123');
    const text = JSON.stringify(enc);
    expect(text).not.toContain('Секрет');
    const parsed = parseBackupFile(text);
    expect(parsed.kind).toBe('encrypted');
    if (parsed.kind !== 'encrypted') return;
    await expect(decryptBackup(parsed.encrypted, 'не тот')).rejects.toBeInstanceOf(WrongPasswordError);
    const back = await decryptBackup(parsed.encrypted, 'пароль-123');
    expect(back.tables.tasks[0]).toMatchObject({ title: 'Секрет' });
  });

  it('напоминание раз в неделю', async () => {
    const now = Date.now();
    expect((await backupDue(now)).due).toBe(false); // пусто — не напоминаем
    for (let i = 0; i < 5; i++) await addTask({ title: `T${i}` });
    expect((await backupDue(now)).due).toBe(true);
    await markBackupDone(now);
    expect((await backupDue(now + 6 * DAY)).due).toBe(false);
    expect((await backupDue(now + 8 * DAY)).due).toBe(true);
    await snoozeBackup(now + 8 * DAY);
    expect((await backupDue(now + 9 * DAY)).due).toBe(false);
    expect((await backupDue(now + 11 * DAY)).due).toBe(true);
  });
});

describe('корзина', () => {
  it('удалённое видно в корзине и восстанавливается', async () => {
    const t = await addTask({ title: 'Удалю' });
    await deleteTask(t.id);
    expect(await listTasks()).toHaveLength(0);
    const trash = await listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ title: 'Удалю', kind: 'Задача', daysLeft: 30 });
    await restoreFromTrash('tasks', t.id);
    expect(await listTasks()).toHaveLength(1);
    expect(await listTrash()).toHaveLength(0);
  });

  it('удалить навсегда и очистить — можно отменить', async () => {
    const a = await addTask({ title: 'A' });
    const b = await addTask({ title: 'B' });
    await deleteTask(a.id);
    await deleteTask(b.id);
    await purgeItem('tasks', a.id);
    expect(await db.tasks.get(a.id)).toBeUndefined();
    await undoLast();
    expect(await db.tasks.get(a.id)).toBeDefined();
    expect(await emptyTrash()).toBe(2);
    expect(await db.tasks.count()).toBe(0);
  });

  it('автоочистка удаляет только то, что старше 30 дней', async () => {
    const a = await addTask({ title: 'Старое' });
    const b = await addTask({ title: 'Свежее' });
    await db.tasks.update(a.id, { deletedAt: Date.now() - 31 * DAY });
    await db.tasks.update(b.id, { deletedAt: Date.now() - 2 * DAY });
    expect(await autoPurgeTrash()).toBe(1);
    expect(await db.tasks.get(a.id)).toBeUndefined();
    expect((await listTrash())[0]).toMatchObject({ title: 'Свежее', daysLeft: 28 });
  });
});
