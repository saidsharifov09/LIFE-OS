import { describe, expect, it } from 'vitest';
import { birthdayInYear, contactDue, daysSinceContact, fmtBirthday, fmtSince, nextBirthday, validMmdd } from './people';
import { extractLinks, guessLaterKind, linkLabel, titleWithoutUrl } from './links';
import { dataUrlBytes, fitSize } from './image';

describe('дни рождения', () => {
  it('ближайший: в этом году, сегодня, в следующем', () => {
    expect(nextBirthday({ birthday: '12-05' }, '2026-11-28')).toEqual({ date: '2026-12-05', daysLeft: 7, age: null });
    expect(nextBirthday({ birthday: '11-28', birthYear: 1990 }, '2026-11-28')).toEqual({ date: '2026-11-28', daysLeft: 0, age: 36 });
    expect(nextBirthday({ birthday: '01-10', birthYear: 2000 }, '2026-11-28')).toEqual({ date: '2027-01-10', daysLeft: 43, age: 27 });
  });
  it('29 февраля в невисокосный год — 28-го', () => {
    expect(birthdayInYear('02-29', 2027)).toBe('2027-02-28');
    expect(birthdayInYear('02-29', 2028)).toBe('2028-02-29');
    expect(nextBirthday({ birthday: '02-29' }, '2026-11-28')!.date).toBe('2027-02-28');
  });
  it('проверка даты', () => {
    expect(validMmdd('02-29')).toBe(true);
    expect(validMmdd('02-30')).toBe(false);
    expect(validMmdd('13-01')).toBe(false);
    expect(validMmdd('')).toBe(false);
    expect(nextBirthday({ birthday: null }, '2026-11-28')).toBeNull();
    expect(fmtBirthday('12-05')).toBe('5 декабря');
    expect(fmtBirthday('03-01', 1995)).toBe('1 марта 1995');
  });
});

describe('последний контакт', () => {
  it('дни и «пора связаться»', () => {
    expect(daysSinceContact({ lastContact: '2026-11-20' }, '2026-11-28')).toBe(8);
    expect(daysSinceContact({ lastContact: null }, '2026-11-28')).toBeNull();
    expect(contactDue({ lastContact: '2026-11-20', contactEvery: 7 }, '2026-11-28')).toBe(true);
    expect(contactDue({ lastContact: '2026-11-25', contactEvery: 7 }, '2026-11-28')).toBe(false);
    expect(contactDue({ lastContact: null, contactEvery: 14 }, '2026-11-28')).toBe(true);
    expect(contactDue({ lastContact: null, contactEvery: null }, '2026-11-28')).toBe(false);
    expect(fmtSince(0)).toBe('сегодня');
    expect(fmtSince(1)).toBe('вчера');
    expect(fmtSince(3)).toBe('3 дня назад');
    expect(fmtSince(11)).toBe('11 дней назад');
    expect(fmtSince(21)).toBe('21 день назад');
  });
});

describe('ссылки', () => {
  it('находит ссылки и отрезает пунктуацию', () => {
    expect(extractLinks('см. https://a.ru/x, и (https://b.com/y). Ещё https://a.ru/x')).toEqual(['https://a.ru/x', 'https://b.com/y']);
    expect(extractLinks('wiki https://ru.wikipedia.org/wiki/Сон_(физиология) тут')).toEqual(['https://ru.wikipedia.org/wiki/Сон_(физиология)']);
    expect(extractLinks('без ссылок')).toEqual([]);
  });
  it('вид и название', () => {
    expect(guessLaterKind('лекция про сон', 'https://youtube.com/watch?v=1')).toBe('video');
    expect(guessLaterKind('фильм Интерстеллар')).toBe('movie');
    expect(guessLaterKind('книга «Атомные привычки»')).toBe('book');
    expect(guessLaterKind('что-то', 'https://example.com')).toBe('link');
    expect(guessLaterKind('что-то')).toBe('other');
    expect(titleWithoutUrl('посмотреть лекцию https://youtu.be/x', 'https://youtu.be/x')).toBe('посмотреть лекцию');
    expect(titleWithoutUrl('https://www.example.com/article/', 'https://www.example.com/article/')).toBe('example.com/article');
    expect(linkLabel('не ссылка')).toBe('не ссылка');
  });
});

describe('изображения', () => {
  it('уменьшение с пропорциями, маленькие не увеличиваем', () => {
    expect(fitSize(4032, 3024)).toEqual({ w: 1280, h: 960 });
    expect(fitSize(3024, 4032)).toEqual({ w: 960, h: 1280 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitSize(0, 10)).toEqual({ w: 0, h: 0 });
    expect(dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(400))).toBe(300);
  });
});
