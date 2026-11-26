// Демо-данные: создаются только по кнопке и удаляются одной кнопкой (все записи помечены demo: true).
import { db, DATA_TABLES } from '@/db/db';
import { addAccount, addEvent, addExpense, addIncome, addLater, addNote, addTask, capture, runAction, setTop } from '@/actions';
import { addDays, startOfWeek, today } from '@/lib/dates';

export async function seedDemo() {
  const t = today();
  await runAction('Демо-данные', async () => {
    const demo = true;
    await addAccount({ name: 'Карта', kind: 'card', currency: 'RUB', initialBalance: 45000, demo });
    await addAccount({ name: 'Наличные', kind: 'cash', currency: 'RUB', initialBalance: 5000, demo });

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
    await addIncome({ amount: 80000, note: 'Зарплата', category: 'salary', date: addDays(t, -5), demo });

    await capture('купить подарок Зарине до пятницы', demo);
    await capture('обед 650', demo);
    await capture('посмотреть лекцию про сон https://youtube.com/watch?v=demo', demo);

    await addNote({ title: 'Идея: приложение для привычек', body: 'Простые отметки, серии, конфетти.', demo });
    await addLater({ title: 'Фильм «Интерстеллар»', kind: 'movie', demo });
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
