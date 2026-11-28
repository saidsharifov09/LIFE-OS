import { describe, expect, it } from 'vitest';
import { interpretRules } from './rules';
import { editStep, validateInterpretation } from './plan';

// 2026-11-25 — среда
const BASE = '2026-11-25';
const r = (t: string) => interpretRules(t, BASE);

describe('шаблонный разбор (уровень «Без ИИ»)', () => {
  it('встреча с датой и временем → событие', () => {
    expect(r('добавь встречу с Али в пятницу в 15:00').steps).toEqual([
      { action: 'addEvent', args: { title: 'Встреча с Али', date: '2026-11-27', start: '15:00', duration: 60 } },
    ]);
  });

  it('трата с категорией', () => {
    expect(r('потратил 1200 на продукты').steps).toEqual([
      { action: 'addExpense', args: { amount: 1200, category: 'food', note: 'Продукты' } },
    ]);
    expect(r('кофе 250').steps[0]).toMatchObject({ action: 'addExpense', args: { amount: 250, category: 'cafe' } });
    expect(r('такси 350 руб').steps[0]).toMatchObject({ action: 'addExpense', args: { amount: 350, currency: 'RUB', category: 'transport' } });
  });

  it('доход', () => {
    expect(r('получил зарплату 50000').steps[0]).toMatchObject({ action: 'addIncome', args: { amount: 50000, category: 'salary' } });
    expect(r('+5000 подработка').steps[0]).toMatchObject({ action: 'addIncome', args: { amount: 5000 } });
  });

  it('вопросы о дне и неделе', () => {
    expect(r('что у меня завтра?')).toEqual({ steps: [], query: { type: 'day', date: '2026-11-26' } });
    expect(r('какие планы на пятницу').query).toEqual({ type: 'day', date: '2026-11-27' });
    expect(r('что у меня сегодня').query).toEqual({ type: 'day', date: BASE });
    expect(r('что у меня на неделе?').query).toEqual({ type: 'week', from: '2026-11-23' });
    expect(r('что просрочено?').query).toEqual({ type: 'overdue' });
  });

  it('вопросы о деньгах, днях рождения, поиск', () => {
    expect(r('сколько я потратил за неделю?').query).toEqual({ type: 'money', from: '2026-11-23', to: BASE });
    expect(r('сколько потратил в этом месяце').query).toEqual({ type: 'money', from: '2026-11-01', to: BASE });
    expect(r('сколько я потратил в октябре').query).toEqual({ type: 'money', from: '2026-10-01', to: '2026-10-31' });
    expect(r('у кого скоро день рождения?').query).toEqual({ type: 'birthdays', days: 30 });
    expect(r('найди заметку про отпуск').query).toEqual({ type: 'search', text: 'отпуск' });
  });

  it('перенос невыполненного и одной задачи', () => {
    expect(r('перенеси невыполненное на субботу').steps).toEqual([{ action: 'moveUnfinished', args: { from: BASE, to: '2026-11-28' } }]);
    expect(r('перенеси всё на завтра').steps).toEqual([{ action: 'moveUnfinished', args: { from: BASE, to: '2026-11-26' } }]);
    expect(r('перенеси задачу позвонить маме на пятницу').steps).toEqual([{ action: 'moveTask', args: { task: 'позвонить маме', date: '2026-11-27' } }]);
  });

  it('задачи', () => {
    expect(r('напомни мне завтра позвонить маме').steps).toEqual([{ action: 'addTask', args: { title: 'Позвонить маме', date: '2026-11-26', time: null } }]);
    expect(r('добавь задачу купить хлеб').steps).toEqual([{ action: 'addTask', args: { title: 'Купить хлеб', date: null, time: null } }]);
    expect(r('срочно оплатить интернет в 18:00').steps[0]).toMatchObject({ action: 'addTask', args: { title: 'Оплатить интернет', time: '18:00', priority: 2 } });
  });

  it('привычки, задачи по имени, здоровье', () => {
    expect(r('сделал зарядку').steps).toEqual([{ action: 'checkHabit', args: { habit: 'зарядку' } }]);
    expect(r('выполнил задачу купить хлеб').steps).toEqual([{ action: 'completeTask', args: { task: 'купить хлеб' } }]);
    expect(r('выпил 2 стакана воды').steps).toEqual([{ action: 'addWater', args: { glasses: 2 } }]);
    expect(r('выпил стакан воды').steps).toEqual([{ action: 'addWater', args: { glasses: 1 } }]);
    expect(r('спал 7 часов').steps).toEqual([{ action: 'setHealth', args: { sleep: 7 } }]);
    expect(r('настроение отличное').steps).toEqual([{ action: 'setHealth', args: { mood: 5 } }]);
    expect(r('вес 72,5').steps).toEqual([{ action: 'setHealth', args: { weight: 72.5 } }]);
    expect(r('бегал 30 минут').steps).toEqual([{ action: 'addWorkout', args: { kind: 'Бег', minutes: 30 } }]);
  });

  it('люди, история, заметки, «посмотреть позже»', () => {
    expect(r('обсудить с мамой поездку в Худжанд').steps).toEqual([{ action: 'addTopic', args: { person: 'мамой', text: 'Поездку в Худжанд' } }]);
    expect(r('созвонился с Зариной').steps).toEqual([{ action: 'markContact', args: { person: 'Зариной' } }]);
    expect(r('сегодня был в парке с Али').steps).toEqual([{ action: 'addLogEntry', args: { text: 'Сегодня был в парке с Али' } }]);
    expect(r('запиши идею: приложение для рецептов').steps).toEqual([{ action: 'addNote', args: { title: 'Приложение для рецептов' } }]);
    expect(r('посмотреть позже https://youtu.be/abc').steps).toEqual([{ action: 'addLater', args: { title: 'https://youtu.be/abc', url: 'https://youtu.be/abc' } }]);
    expect(r('посмотреть фильм Дюна').steps[0]).toMatchObject({ action: 'addLater', args: { title: 'Посмотреть фильм Дюна' } });
  });

  it('несколько команд и непонятное', () => {
    const res = r('кофе 250\nзавтра в 10 встреча с Али');
    expect(res.steps.map((s) => s.action)).toEqual(['addExpense', 'addEvent']);
    const bad = r('абракадабра');
    expect(bad.steps).toEqual([{ action: 'capture', args: { text: 'абракадабра' } }]);
    expect(bad.reply).toBeTruthy();
  });
});

describe('проверка плана', () => {
  it('отбрасывает неизвестные действия и неверные поля', () => {
    const p = validateInterpretation({
      reply: 'ок',
      steps: [
        { action: 'dropDatabase', args: {} },
        { action: 'addTask', args: { title: '  Купить хлеб ', date: '2026-13-45', time: '9:05', priority: 5 } },
        { action: 'addExpense', args: { amount: -10 } },
        { action: 'addExpense', args: { amount: '250', category: 'hack', currency: 'EUR' } },
      ],
      query: { type: 'day', date: '2026-11-26' },
    });
    expect(p.steps).toEqual([
      { action: 'addTask', args: { title: 'Купить хлеб', time: '09:05' } },
      { action: 'addExpense', args: { amount: 250 } },
    ]);
    expect(p.query).toEqual({ type: 'day', date: '2026-11-26' });
  });

  it('ограничивает число шагов и терпит мусор', () => {
    expect(validateInterpretation(null)).toEqual({ steps: [] });
    const many = Array.from({ length: 30 }, (_, i) => ({ action: 'addNote', args: { title: `n${i}` } }));
    expect(validateInterpretation({ steps: many }).steps).toHaveLength(10);
  });

  it('правка поля в карточке', () => {
    const s = { action: 'addExpense', args: { amount: 250, note: 'Кофе' } } as const;
    expect(editStep(s, 'amount', '300')).toEqual({ action: 'addExpense', args: { amount: 300, note: 'Кофе' } });
    expect(editStep(s, 'amount', 'abc')).toEqual(s); // неверное — без изменений
    expect(editStep(s, 'note', '')).toEqual({ action: 'addExpense', args: { amount: 250 } });
  });
});
