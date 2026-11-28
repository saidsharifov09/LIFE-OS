import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { addHabit, addPerson, addTask, addExpense, undoLast } from '@/actions';
import { addDays, today } from '@/lib/dates';
import { answerQuery, executePlan, matchPerson, resolvePlan } from './run';
import { interpretRules } from './rules';
import { CloudAiError, interpret } from './cloud';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const plan = async (text: string) => resolvePlan(interpretRules(text).steps);

describe('помощник на базе', () => {
  it('ничего не меняет до подтверждения; весь план отменяется одним действием', async () => {
    const items = await plan('потратил 1200 на продукты\nнапомни завтра позвонить маме');
    expect(items.map((i) => i.kind)).toEqual(['expense', 'task']);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);

    const res = await executePlan(items);
    expect(res.done).toBe(2);
    expect(await db.transactions.count()).toBe(1);
    expect((await db.tasks.toArray())[0]).toMatchObject({ title: 'Позвонить маме', date: addDays(today(), 1) });

    expect(await undoLast()).toMatch(/Помощник: 2 действия/);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
  });

  it('находит людей по имени в любом падеже', async () => {
    const mama = await addPerson({ name: 'Мама', relation: 'семья' });
    const zarina = await addPerson({ name: 'Зарина' });
    await addPerson({ name: 'Али' });
    const people = await db.people.toArray();
    expect(matchPerson('маме', people)?.id).toBe(mama.id);
    expect(matchPerson('мамой', people)?.id).toBe(mama.id);
    expect(matchPerson('Зариной', people)?.id).toBe(zarina.id);
    expect(matchPerson('Али', people)?.name).toBe('Али');
    expect(matchPerson('Пётр', people)).toBeUndefined();
  });

  it('тема для разговора и контакт; неизвестный человек — шаг пропускается', async () => {
    const mama = await addPerson({ name: 'Мама' });
    const items = await plan('обсудить с мамой поездку\nсозвонился с Петром');
    expect(items[0].refId).toBe(mama.id);
    expect(items[1].problem).toMatch(/Нет «Петром»/);
    const res = await executePlan(items);
    expect(res.done).toBe(1);
    expect((await db.people.get(mama.id))!.topics.map((t) => t.text)).toEqual(['Поездку']);
  });

  it('«сделал зарядку» отмечает привычку, а без привычки — находит задачу', async () => {
    const h = await addHabit({ title: 'Зарядка', emoji: '🤸' });
    await executePlan(await plan('сделал зарядку'));
    expect((await db.habitChecks.get(`${h.id}_${today()}`))?.count).toBe(1);
    // Повторно — не снимает отметку (в отличие от касания)
    await executePlan(await plan('сделал зарядку'));
    expect((await db.habitChecks.get(`${h.id}_${today()}`))?.count).toBe(1);

    const t = await addTask({ title: 'Купить хлеб' });
    const items = await plan('сделал купить хлеб');
    expect(items[0]).toMatchObject({ kind: 'task', refId: t.id });
    await executePlan(items);
    expect((await db.tasks.get(t.id))!.done).toBe(true);
  });

  it('перенос невыполненного и история с людьми', async () => {
    const yest = addDays(today(), -1);
    await addTask({ title: 'Старая', date: yest });
    const ali = await addPerson({ name: 'Али' });
    const items = await plan('перенеси невыполненное на завтра\nсегодня был в парке с Али');
    expect(items[0].text).toMatch(/1 задача/);
    expect(items[1].personIds).toEqual([ali.id]);
    await executePlan(items);
    expect((await db.tasks.toArray())[0].date).toBe(addDays(today(), 1));
    expect((await db.people.get(ali.id))!.lastContact).toBe(today());
  });

  it('ответы на вопросы — из базы на устройстве', async () => {
    await addTask({ title: 'Позвонить в банк', date: addDays(today(), 1), time: '10:00' });
    await addExpense({ amount: 500, category: 'cafe', note: 'Обед' });
    const day = await answerQuery(interpretRules('что у меня завтра?').query!);
    expect(day.lines.map((l) => l.text)).toEqual(['Позвонить в банк']);
    expect(day.lines[0].path).toMatch(/^\/tasks\?open=/);
    const money = await answerQuery(interpretRules('сколько я потратил сегодня?').query!);
    expect(money.lines[0].text).toMatch(/500/);
    const found = await answerQuery({ type: 'search', text: 'банк' });
    expect(found.lines[0].text).toBe('Позвонить в банк');
  });
});

describe('уровни: облако с запасным разбором', () => {
  const cloudOn = { level: 'cloud' as const, provider: 'auto' as const, consent: true };

  it('облако отвечает — берём его план', async () => {
    const r = await interpret('что-то', cloudOn, async () => ({ steps: [{ action: 'addNote', args: { title: 'Из облака' } }], provider: 'groq' }));
    expect(r.by).toBe('cloud');
    expect(r.steps[0]).toMatchObject({ action: 'addNote' });
  });

  it('лимит или нет сети — сам переключается на разбор без ИИ и говорит об этом', async () => {
    const r = await interpret('кофе 250', cloudOn, async () => { throw new CloudAiError('limit'); });
    expect(r.by).toBe('rules');
    expect(r.notice).toMatch(/лимит/);
    expect(r.steps[0]).toMatchObject({ action: 'addExpense', args: { amount: 250 } });
  });

  it('без согласия облако не вызывается', async () => {
    let called = false;
    await interpret('кофе 250', { ...cloudOn, consent: false }, async () => { called = true; return { steps: [] }; });
    expect(called).toBe(false);
  });
});
