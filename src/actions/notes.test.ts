import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  addLater, addLogEntry, addNote, addPerson, addSection, addTopic, archiveNote, deleteSection, ensureNoteSections,
  listLater, listNotes, listSections, logForPerson, logRange, markContact, markLater, moveSection, peopleToContact,
  pinNote, processInbox, capture, toggleTopic, undoLast, updateNote, updatePerson, upcomingBirthdays,
} from './index';
import { addDays, today } from '@/lib/dates';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('блокнот', () => {
  it('стартовые разделы создаются один раз с предсказуемыми id', async () => {
    const a = await ensureNoteSections();
    const b = await ensureNoteSections();
    expect(a).toHaveLength(11);
    expect(b.map((s) => s.id)).toEqual(a.map((s) => s.id));
    expect(a[0]).toMatchObject({ id: 'sec_default_0', name: 'Для себя', icon: '🙂' });
    expect(a[10].name).toBe('Разное');
  });

  it('заметка без раздела — в «Разное»; теги нормализуются; закрепление сверху', async () => {
    const n1 = await addNote({ title: 'Первая', tags: ['#Идея', ' идея ', 'Дом'] });
    const n2 = await addNote({ title: 'Вторая' });
    expect(n1.tags).toEqual(['идея', 'дом']);
    const sections = await listSections();
    expect(sections.find((s) => s.id === n1.sectionId)!.name).toBe('Разное');
    await pinNote(n1.id, true);
    expect((await listNotes()).map((n) => n.title)).toEqual(['Первая', 'Вторая']);
    await updateNote(n2.id, { body: 'текст' });
    expect((await listNotes())[0].title).toBe('Первая'); // закреплённая всё равно выше свежей
  });

  it('архив: убирает из списка и снимает закрепление', async () => {
    const n = await addNote({ title: 'Старое', pinned: true });
    await archiveNote(n.id, true);
    expect(await listNotes({ archived: false })).toHaveLength(0);
    const [a] = await listNotes({ archived: true });
    expect(a.pinned).toBe(false);
    await archiveNote(n.id, false);
    expect((await listNotes({ archived: false }))[0].pinned).toBe(false);
  });

  it('разделы: новый, порядок, удаление переносит заметки в «Разное»; отмена возвращает', async () => {
    const s = await addSection('Рецепты', '🍲');
    let list = await listSections();
    expect(list[list.length - 1].name).toBe('Рецепты');
    await moveSection(s.id, -1);
    list = await listSections();
    expect(list[list.length - 2].name).toBe('Рецепты');
    const n = await addNote({ title: 'Плов', sectionId: s.id });
    const target = await deleteSection(s.id);
    expect(target.name).toBe('Разное');
    expect((await db.notes.get(n.id))!.sectionId).toBe(target.id);
    expect((await listSections()).some((x) => x.id === s.id)).toBe(false);
    await undoLast();
    expect((await db.notes.get(n.id))!.sectionId).toBe(s.id);
    expect((await listSections()).some((x) => x.id === s.id)).toBe(true);
  });

  it('последний раздел удалить нельзя; после удаления всех — стартовые возвращаются', async () => {
    const list = await ensureNoteSections();
    for (const s of list.slice(1)) await deleteSection(s.id);
    await expect(deleteSection(list[0].id)).rejects.toThrow(/последний/);
    expect(await listSections()).toHaveLength(1);
  });
});

describe('посмотреть позже', () => {
  it('из входящих: ссылка отделяется от названия, вид угадывается', async () => {
    const i = await capture('посмотреть лекцию про сон https://youtube.com/watch?v=demo');
    await processInbox(i.id, 'later');
    const [it] = await listLater();
    expect(it).toMatchObject({ title: 'посмотреть лекцию про сон', url: 'https://youtube.com/watch?v=demo', kind: 'video', done: false });
  });

  it('«посмотрел»: вниз списка, с датой; повторно — обратно', async () => {
    const a = await addLater({ title: 'Фильм «Интерстеллар»' });
    await addLater({ title: 'Статья', url: 'https://habr.com/x' });
    expect(a.kind).toBe('movie');
    await markLater(a.id);
    let list = await listLater();
    expect(list[1]).toMatchObject({ id: a.id, done: true });
    expect(list[1].doneAt).toBeTypeOf('number');
    await markLater(a.id, false);
    list = await listLater();
    expect(list.find((x) => x.id === a.id)!.doneAt).toBeNull();
  });
});

describe('люди и история', () => {
  it('ближайшие дни рождения и неверная дата', async () => {
    const t = today();
    const soon = addDays(t, 3).slice(5);
    await addPerson({ name: 'Зарина', birthday: soon, birthYear: 1995 });
    await addPerson({ name: 'Без даты', birthday: '02-31' });
    await addPerson({ name: 'Сегодня', birthday: t.slice(5) });
    const list = await upcomingBirthdays(14);
    expect(list.map((x) => x.person.name)).toEqual(['Сегодня', 'Зарина']);
    expect(list[1].next.daysLeft).toBe(3);
    expect((await db.people.toArray()).find((p) => p.name === 'Без даты')!.birthday).toBeNull();
  });

  it('«что обсудить» и контакт', async () => {
    const p = await addPerson({ name: 'Али', topics: ['Поездка'], contactEvery: 7 });
    expect(await peopleToContact()).toHaveLength(1);
    const topic = await addTopic(p.id, 'Вернуть книгу');
    await toggleTopic(p.id, topic!.id);
    const after = await db.people.get(p.id);
    expect(after!.topics.map((x) => [x.text, x.done])).toEqual([['Поездка', false], ['Вернуть книгу', true]]);
    await markContact(p.id);
    expect(await peopleToContact()).toHaveLength(0);
    await updatePerson(p.id, { lastContact: addDays(today(), -10) });
    expect((await peopleToContact())[0].since).toBe(10);
  });

  it('запись «с кем» обновляет последний контакт только вперёд; лента по дням', async () => {
    const t = today();
    const p = await addPerson({ name: 'Мама', lastContact: addDays(t, -2) });
    await addLogEntry({ text: 'Старая встреча', kind: 'people', date: addDays(t, -5), time: '10:00', personIds: [p.id] });
    expect((await db.people.get(p.id))!.lastContact).toBe(addDays(t, -2));
    await addLogEntry({ text: 'Обед с мамой', kind: 'people', date: t, time: '13:00', personIds: [p.id] });
    await addLogEntry({ text: 'Решил бегать', kind: 'decision', date: t, time: '20:00' });
    expect((await db.people.get(p.id))!.lastContact).toBe(t);
    const feed = await logRange(addDays(t, -7), t);
    expect(feed.map((e) => e.text)).toEqual(['Решил бегать', 'Обед с мамой', 'Старая встреча']);
    expect((await logForPerson(p.id)).length).toBe(2);
    await undoLast(); // отмена последней записи
    await undoLast(); // отмена «обед» — откатывает и контакт
    expect((await db.people.get(p.id))!.lastContact).toBe(addDays(t, -2));
  });
});
