import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { highlight, normalize, scoreMatch, snippet, stems, tokenize } from './search';
import {
  addEvent, addExpense, addNote, addPerson, addTask, completeTask, deleteTask, groupHits, searchAll,
} from '@/actions';
import { today } from './dates';

describe('поиск: текстовые функции', () => {
  it('нормализация: регистр, ё, пробелы', () => {
    expect(normalize('  Ёлка   ЗЕЛЁНАЯ ')).toBe('елка зеленая');
    expect(tokenize('«Купить» молоко, хлеб!')).toEqual(['купить', 'молоко', 'хлеб']);
  });

  it('окончания: длинные русские слова обрезаются на 1–2 буквы', () => {
    expect(stems('встречи')).toEqual(['встречи', 'встреч', 'встре']);
    expect(stems('кот')).toEqual(['кот']);
    expect(stems('iphone')).toEqual(['iphone']);
  });

  it('все слова запроса должны найтись; название весит больше текста', () => {
    const t = tokenize('молоко хлеб');
    expect(scoreMatch(t, { title: 'Купить молоко', text: 'и хлеб' })).toBeGreaterThan(0);
    expect(scoreMatch(t, { title: 'Купить молоко' })).toBe(0);
    const inTitle = scoreMatch(tokenize('отчёт'), { title: 'Отчет за месяц' });
    const inText = scoreMatch(tokenize('отчёт'), { title: 'Работа', text: 'сдать отчёт' });
    expect(inTitle).toBeGreaterThan(inText);
    expect(scoreMatch(tokenize('встречи'), { title: 'Встреча с Али' })).toBeGreaterThan(0);
  });

  it('точное название выше, чем частичное', () => {
    const q = tokenize('книги');
    expect(scoreMatch(q, { title: 'Книги' })).toBeGreaterThan(scoreMatch(q, { title: 'Купить книги детям' }));
  });

  it('фрагмент вокруг найденного слова', () => {
    const long = 'Начало текста. '.repeat(10) + 'Тут спрятан пароль от вайфая в шкафу. ' + 'Конец. '.repeat(10);
    const s = snippet(long, ['вайфая'], 20);
    expect(s).toContain('вайфая');
    expect(s.startsWith('…')).toBe(true);
    expect(snippet('ничего', ['слово'])).toBe('');
  });

  it('подсветка совпадений не зависит от регистра и ё', () => {
    expect(highlight('Зелёный Чай', ['зеленый'])).toEqual([{ text: 'Зелёный', hit: true }, { text: ' Чай', hit: false }]);
  });
});

describe('поиск по всему приложению', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('находит в задачах, заметках, событиях, людях и операциях', async () => {
    await addTask({ title: 'Позвонить в банк', notes: 'про кредитку' });
    await addNote({ title: 'Идеи для отпуска', body: 'Съездить в банк Тбилиси? Нет — в горы', tags: ['путешествия'] });
    await addEvent({ title: 'Встреча в банке', date: today(), start: '15:00' });
    await addPerson({ name: 'Али', notes: 'работает в банке' });
    await addExpense({ amount: 1250, note: 'Комиссия банка', accountId: null });

    const hits = await searchAll('банк');
    const kinds = hits.map((h) => h.kind);
    expect(kinds).toEqual(expect.arrayContaining(['task', 'note', 'event', 'person', 'transaction']));
    const note = hits.find((h) => h.kind === 'note')!;
    expect(note.snippet).toContain('банк');
    expect(note.path).toMatch(/^\/notes\?open=/);
    expect(hits.find((h) => h.kind === 'event')!.path).toContain(`date=${today()}`);

    // По сумме и по тегу
    expect((await searchAll('1250')).map((h) => h.kind)).toEqual(['transaction']);
    expect((await searchAll('путешествия')).map((h) => h.kind)).toEqual(['note']);
  });

  it('удалённое не находится, выполненное — ниже и приглушено', async () => {
    const a = await addTask({ title: 'Купить корм коту' });
    const b = await addTask({ title: 'Купить корм коту на месяц' });
    await completeTask(a.id);
    const gone = await addTask({ title: 'Купить корм старый' });
    await deleteTask(gone.id);
    const hits = await searchAll('корм');
    const ids = hits.map((h) => h.id);
    expect(ids).not.toContain(gone.id);
    expect(ids[0]).toBe(b.id);
    expect(hits.find((h) => h.id === a.id)?.dim).toBe(true);
  });

  it('пустой запрос — пусто; группы в постоянном порядке', async () => {
    expect(await searchAll('   ')).toEqual([]);
    await addNote({ title: 'Чай' });
    await addTask({ title: 'Чай купить' });
    const groups = groupHits(await searchAll('чай'));
    expect(groups.map((g) => g.kind)).toEqual(['task', 'note']);
    expect(groups[0].label).toBe('Задачи');
  });
});
