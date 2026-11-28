// Демо-данные: создаются только по кнопке и удаляются одной кнопкой (все записи помечены demo: true).
import { db, DATA_TABLES } from '@/db/db';
import {
  addAccount, addDebt, addEvent, addExpense, addIncome, addLater, addNote, addRecurring, addSavings, setBudget, addTask, addTransfer, capture, runAction, setTop,
  addGoal, addHabit, checkHabit, setHealth, addWorkout, toggleMilestone,
  addPerson, addLogEntry, ensureNoteSections, pinNote, markLater,
} from '@/actions';
import type { HealthDay } from '@/db/types';
import { addDays, startOfWeek, today, weekday } from '@/lib/dates';

export async function seedDemo() {
  const t = today();
  await runAction('Демо-данные', async () => {
    const demo = true;
    const card = await addAccount({ name: 'Карта', kind: 'card', currency: 'RUB', initialBalance: 45000, color: '#38bdf8', demo });
    const cash = await addAccount({ name: 'Наличные', kind: 'cash', currency: 'RUB', initialBalance: 5000, color: '#34d399', demo });
    await addAccount({ name: 'Сомони', kind: 'cash', currency: 'TJS', initialBalance: 1200, color: '#fbbf24', demo });

    const a = await addTask({ title: 'Подготовить отчёт', date: t, time: '11:00', priority: 3, category: 'work', subtasks: ['Собрать цифры', 'Сделать графики', 'Отправить'], demo });
    const b = await addTask({ title: 'Позвонить маме', date: t, time: '19:00', category: 'personal', demo });
    await addTask({ title: 'Купить продукты', date: t, category: 'home', priority: 1, demo });
    const c = await addTask({ title: 'Тренировка 30 минут', date: t, category: 'health', recurrence: { freq: 'weekly', interval: 1, days: [0, 2, 4] }, demo });
    await addTask({ title: 'Оплатить интернет', date: addDays(t, -1), category: 'money', priority: 2, demo });
    await addTask({ title: 'Записаться к стоматологу', date: addDays(t, 1), category: 'health', demo });
    await addTask({ title: 'Прочитать главу книги', date: addDays(t, 3), category: 'study', demo });
    await addTask({ title: 'Разобрать шкаф', category: 'home', demo });
    await addTask({ title: 'Идеи для отпуска', category: 'personal', demo });
    await setTop(a.id, t);
    await setTop(b.id, t);
    await setTop(c.id, t);

    await addEvent({ title: 'Созвон с командой', date: t, start: '10:00', duration: 45, color: '#a78bfa', demo });
    await addEvent({ title: 'Обед с Али', date: t, start: '13:30', duration: 60, color: '#fbbf24', demo });
    await addEvent({ title: 'Спортзал', date: startOfWeek(t), start: '08:00', duration: 90, color: '#34d399', recurrence: { freq: 'weekly', interval: 1, days: [1, 3] }, demo });
    await addEvent({ title: 'День рождения Зарины', date: addDays(t, 4), start: null, duration: 0, color: '#f472b6', demo });

    await addExpense({ amount: 250, note: 'Кофе', category: 'cafe', date: t, demo });
    await addExpense({ amount: 1840, note: 'Продукты', category: 'food', date: addDays(t, -1), demo });
    await addExpense({ amount: 420, note: 'Такси', category: 'transport', date: addDays(t, -2), demo });
    await addIncome({ amount: 80000, note: 'Зарплата', category: 'salary', date: addDays(t, -5), accountId: card.id, demo });
    // Траты за прошлые месяцы — чтобы аналитике было что показать
    const past: [number, string, string, number][] = [
      [3200, 'Продукты', 'food', 12], [890, 'Кафе', 'cafe', 15], [1500, 'Такси', 'transport', 20], [650, 'Интернет', 'phone', 25],
      [2700, 'Продукты', 'food', 40], [2300, 'Кроссовки', 'clothes', 45], [1200, 'Кино', 'fun', 50], [4100, 'Продукты', 'food', 70],
      [950, 'Аптека', 'health', 75], [600, 'Кофе', 'cafe', 8], [1300, 'Продукты', 'food', 4],
    ];
    for (const [amount, note, category, ago] of past) await addExpense({ amount, note, category, date: addDays(t, -ago), accountId: card.id, demo });
    await addIncome({ amount: 78000, note: 'Зарплата', category: 'salary', date: addDays(t, -35), accountId: card.id, demo });
    await addIncome({ amount: 78000, note: 'Зарплата', category: 'salary', date: addDays(t, -66), accountId: card.id, demo });
    await addTransfer({ fromId: card.id, toId: cash.id, amount: 3000, date: addDays(t, -3), note: 'Снял наличные', demo });
    await addRecurring({ title: 'Интернет', amount: 650, category: 'phone', startDate: addDays(t, 2), recurrence: { freq: 'monthly', interval: 1 }, accountId: card.id, demo });
    await addRecurring({ title: 'Яндекс Плюс', amount: 399, category: 'subs', startDate: addDays(t, 9), recurrence: { freq: 'monthly', interval: 1 }, subscription: true, accountId: card.id, demo });
    await addRecurring({ title: 'Аренда', amount: 25000, category: 'home', startDate: addDays(t, -1), recurrence: { freq: 'monthly', interval: 1 }, accountId: card.id, demo });
    await addDebt({ person: 'Али', direction: 'they_owe', amount: 2000, due: addDays(t, 5), note: 'за билеты', demo });
    await addDebt({ person: 'Брат', direction: 'i_owe', amount: 50, currency: 'USD', demo });
    await addSavings({ name: 'Отпуск', target: 120000, saved: 35000, deadline: addDays(t, 180), color: '#2dd4bf', demo });
    await addSavings({ name: 'Новый ноутбук', target: 70000, saved: 12000, color: '#a78bfa', demo });
    for (const [category, amount] of [['cafe', 3000], ['food', 15000], ['fun', 2000]] as const) await setBudget(category, amount, demo);

    await capture('купить подарок Зарине до пятницы', demo);
    await capture('обед 650', demo);
    await capture('посмотреть лекцию про сон https://youtube.com/watch?v=demo', demo);

    // Блокнот, «Посмотреть позже», люди, история (Этап 6)
    const sec = new Map((await ensureNoteSections()).map((s) => [s.name, s.id]));
    const idea = await addNote({ title: 'Идея: приложение для привычек', body: 'Простые отметки, серии, конфетти.', sectionId: sec.get('Идеи'), tags: ['проект'], demo });
    await pinNote(idea.id, true);
    await addNote({ title: 'Купить', body: 'Молоко\nБатарейки AA\nПодарок Зарине', sectionId: sec.get('Что купить'), tags: ['дом'], demo });
    await addNote({ title: 'Кофейня на Рудаки', body: 'Говорят, лучший раф в городе. https://maps.google.com/?q=coffee', sectionId: sec.get('Куда сходить'), tags: ['кафе'], demo });
    await addNote({ title: 'Осьминоги', body: 'У осьминога три сердца и голубая кровь.', sectionId: sec.get('Интересные факты'), demo });
    await addNote({ title: 'Атомные привычки', body: 'Маленькие шаги каждый день → большой результат.', sectionId: sec.get('Книги'), tags: ['саморазвитие'], demo });
    await addLater({ title: 'Фильм «Интерстеллар»', kind: 'movie', demo });
    await addLater({ title: 'Лекция про дофамин и СДВГ https://youtube.com/watch?v=demo2', demo });
    await addLater({ title: 'Статья о тайм-блокинге', url: 'https://habr.com/ru/articles/demo', kind: 'article', demo });
    await addLater({ title: 'Сериал «Тед Лассо»', demo });
    const seen = await addLater({ title: 'Книга «Мастер и Маргарита»', kind: 'book', demo });
    await markLater(seen.id);
    const zarina = await addPerson({ name: 'Зарина', relation: 'Друг', color: '#f472b6', birthday: addDays(t, 4).slice(5), birthYear: 1996, topics: ['Рассказать про новую работу', 'Вернуть книгу'], lastContact: addDays(t, -9), contactEvery: 14, demo });
    const mom = await addPerson({ name: 'Мама', relation: 'Семья', color: '#34d399', favorite: true, birthday: '03-08', lastContact: addDays(t, -1), contactEvery: 3, demo });
    await addPerson({ name: 'Али', relation: 'Друг', color: '#fbbf24', birthday: addDays(t, 40).slice(5), topics: ['Билеты на футбол'], lastContact: addDays(t, -25), contactEvery: 14, demo });
    await addPerson({ name: 'Брат', relation: 'Семья', color: '#38bdf8', demo });
    await addLogEntry({ text: 'Утренняя прогулка в парке', kind: 'place', date: t, time: '08:10', demo });
    await addLogEntry({ text: 'Позвонил маме, обсудили выходные', kind: 'people', date: addDays(t, -1), time: '19:30', personIds: [mom.id], demo });
    await addLogEntry({ text: 'Узнал, что 20 минут ходьбы помогают сосредоточиться', kind: 'learned', date: addDays(t, -1), time: '12:00', demo });
    await addLogEntry({ text: 'Решил ложиться до 23:30', kind: 'decision', date: addDays(t, -2), time: '22:40', demo });
    await addLogEntry({ text: 'Кофе с Зариной', kind: 'people', date: addDays(t, -9), time: '17:00', personIds: [zarina.id], demo });
    await addLogEntry({ text: 'Спокойный день, всё успел', kind: 'evening', date: addDays(t, -2), time: '23:00', mood: 4, demo });

    // Цели, привычки, здоровье — с историей за месяц (детерминированно, без Math.random)
    const goal = await addGoal({ title: 'Пробежать 10 км', why: 'Чтобы чувствовать себя бодрым и гордиться собой', deadline: addDays(t, 90), color: '#2dd4bf', emoji: '🏃', milestones: ['Пробежать 3 км без остановки', 'Пробежать 5 км', 'Пробежать 7 км', 'Пробежать 10 км'], demo });
    await toggleMilestone(goal.id, goal.milestones[0].id);
    await addGoal({ title: 'Английский до уровня B1', why: 'Свободно путешествовать и читать в оригинале', deadline: addDays(t, 200), color: '#a78bfa', emoji: '🗣️', progress: 30, demo });
    const habits = [
      await addHabit({ title: 'Стакан воды утром', emoji: '💧', color: '#38bdf8', demo }),
      await addHabit({ title: 'Пробежка', emoji: '🏃', color: '#2dd4bf', days: [0, 2, 4], goalId: goal.id, demo }),
      await addHabit({ title: 'Чтение 15 минут', emoji: '📚', color: '#fbbf24', demo }),
      await addHabit({ title: 'Зубы', emoji: '🪥', color: '#a78bfa', target: 2, demo }),
    ];
    const pr = (i: number, k: number) => ((i * 7 + k * 13) % 10) / 10; // псевдослучайное 0..0.9
    const wd = weekday;
    for (let i = 30; i >= 1; i--) {
      const d = addDays(t, -i);
      for (let k = 0; k < habits.length; k++) {
        const h = habits[k];
        if (h.days.length && !h.days.includes(wd(d))) continue;
        if (pr(i, k) < (i < 8 ? 0.85 : 0.7)) await checkHabit(h.id, d, h.target);
      }
      const day: Partial<HealthDay> = {
        sleep: 6 + Math.round(pr(i, 1) * 5) / 2, water: 4 + Math.round(pr(i, 2) * 5),
        mood: (2 + Math.round(pr(i, 3) * 3)) as HealthDay['mood'], feeling: (2 + Math.round(pr(i, 4) * 3)) as HealthDay['feeling'],
      };
      if (i % 4 === 0) day.weight = Math.round((76 - (30 - i) * 0.06 + pr(i, 5) * 0.4) * 10) / 10;
      await setHealth(d, day, demo);
      if (wd(d) === 0 || wd(d) === 2 || wd(d) === 4) await addWorkout({ kind: wd(d) === 2 ? 'Зал' : 'Бег', minutes: wd(d) === 2 ? 60 : 30, date: d, demo });
    }
    await checkHabit(habits[0].id, t);
    await setHealth(t, { water: 3, sleep: 7.5 }, demo);
  });
}

/** Удалить все демо-записи (только их — ваши данные не трогаются) */
export async function clearDemo(): Promise<number> {
  let n = 0;
  for (const name of DATA_TABLES) {
    const table = db.table(name);
    const ids = (await table.toArray()).filter((r: { demo?: boolean }) => r.demo).map((r: { id: string }) => r.id);
    // Записи, созданные из демо-входящих при разборе, демо-флага не имеют — это уже ваши действия
    await table.bulkDelete(ids);
    n += ids.length;
  }
  return n;
}

export async function hasDemo(): Promise<boolean> {
  for (const name of DATA_TABLES) {
    if ((await db.table(name).toArray()).some((r: { demo?: boolean }) => r.demo)) return true;
  }
  return false;
}
