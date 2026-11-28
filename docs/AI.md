# Слой действий и будущий ИИ-чат

## Слой действий (`src/actions`)

Все изменения данных в приложении идут **только** через функции слоя действий. Так работают кнопка «Отменить»,
будущая синхронизация и ИИ-чат (Этап 9): ИИ не трогает базу напрямую, а предлагает список вызовов этих функций.

Каждое действие обёрнуто в `runAction(label, fn)`: оно запоминает состояние затронутых записей «до», и
`undoLast()` откатывает действие целиком (даже если оно меняло несколько таблиц, например «разбор входящих»).

### Задачи — `src/actions/tasks.ts`
| Функция | Что делает |
|---|---|
| `addTask({ title, notes?, date?, time?, priority?, category?, subtasks?, recurrence? })` | создать задачу |
| `updateTask(id, changes)` | изменить поля |
| `completeTask(id, done = true)` | выполнить/вернуть; для повторяющейся создаёт следующую копию |
| `moveTask(id, date \| null, time?)` | перенести (null — без даты) |
| `moveUnfinished(from, to)` | перенести все невыполненные с датой ≤ from на to («перенеси невыполненное на субботу») |
| `deleteTask(id)` | в корзину |
| `toggleSubtask(taskId, subId)` | отметить подзадачу |
| `setTop(id, date \| null)` | отметить как одно из 3 главных дел на дату |
| `listTasks()` | все живые задачи |

### События — `src/actions/events.ts`
| Функция | Что делает |
|---|---|
| `addEvent({ title, date, start?, duration?, color?, recurrence?, remind?, taskId? })` | создать событие (start null — весь день) |
| `updateEvent(id, changes)` | изменить |
| `moveEvent(id, fromDate, toDate, start?)` | перенести (для серии — сдвиг всей серии) |
| `deleteEvent(id)` / `skipOccurrence(id, date)` | удалить всё / одно вхождение |
| `eventFromTask(taskId)` | создать связанное событие из задачи |
| `eventsInRange(from, to)` | вхождения с учётом повторов |

### Входящие — `src/actions/inbox.ts`
| `capture(text)` | записать мысль, распознать подсказки |
|---|---|
| `processInbox(id, 'task'\|'event'\|'note'\|'expense'\|'income'\|'later', { useHints?, title? })` | разобрать |
| `deleteInbox(id)`, `updateInboxText(id, text)` | удалить, исправить |

### Деньги — `src/actions/money.ts`
- Операции: `addExpense({ amount, currency?, category?, date?, note?, accountId? })`, `addIncome(...)`,
  `addTransfer({ fromId, toId, amount, toAmount? })`, `updateTransaction`, `deleteTransaction`, `listTransactions()`.
- Счета: `addAccount`, `updateAccount`, `deleteAccount`, `listAccounts()`.
- Бюджеты: `setBudget(category, amount)` (0 — убрать; `'__total'` — весь месяц), `listBudgets()`.
- Регулярные платежи: `addRecurring`, `updateRecurring`, `payRecurring(id)`, `skipRecurring(id)`, `deleteRecurring`, `listRecurring()`.
- Долги: `addDebt({ person, direction, amount })`, `repayDebt(id, amount)`, `updateDebt`, `deleteDebt`, `listDebts()`.
- Копилки: `addSavings`, `moveSavings(id, ±amount, accountId?)`, `updateSavings`, `deleteSavings`, `listSavings()`.
- Курсы и сводки: `getRates()`, `setRates()`, `moneySummary(date)`, `financeData()`, `importTransactions(items)`.
  Расчёты без БД — `src/lib/finance.ts` (`accountBalances`, `totals`, `byCategory`, `budgetStates`, `toCSV`/`fromCSV`).

### Прочее — `src/actions/misc.ts`, `src/actions/day.ts`
`markReview`, `getReview`, `getSetting`, `setSetting`, **`getDay(date)`** — сводка дня (задачи, просроченные,
3 главных, события, прогресс, деньги) — ответ на «что у меня завтра?».

### Блокнот, «Посмотреть позже», история — `src/actions/notes.ts`
| Функция | Что делает |
|---|---|
| `addNote({ title, body?, sectionId?, tags?, images?, pinned? })`, `updateNote`, `pinNote(id, bool)`, `archiveNote(id, bool)`, `deleteNote`, `listNotes({ sectionId?, archived? })` | заметки («запиши идею…») |
| `listSections()`, `ensureNoteSections()`, `addSection(name, icon?)`, `updateSection`, `moveSection(id, ±1)`, `deleteSection(id)` | разделы блокнота |
| `addLater({ title, url?, kind? })`, `markLater(id, done)`, `updateLater`, `deleteLater`, `listLater()` | «посмотреть позже» (вид угадывается по ссылке/тексту) |
| `addLogEntry({ text, kind?, date?, time?, mood?, personIds? })`, `updateLogEntry`, `deleteLogEntry`, `logRange(from, to)`, `logForPerson(id)` | история («сегодня был в парке с Али») |

### Люди — `src/actions/people.ts`
| Функция | Что делает |
|---|---|
| `addPerson({ name, relation?, birthday? 'MM-DD', birthYear?, topics?, contactEvery? })`, `updatePerson`, `deletePerson`, `listPeople()` | люди |
| `addTopic(personId, text)`, `toggleTopic`, `removeTopic` | «что обсудить с мамой» |
| `markContact(id, date?)` | «созвонился с Зариной» |
| `upcomingBirthdays(days)`, `peopleToContact()` | «у кого скоро день рождения?», «кому давно не писал?» |

### Цели, привычки, здоровье — `src/actions/life.ts`
| Функция | Что делает |
|---|---|
| `addGoal({ title, why?, deadline?, milestones? })`, `updateGoal`, `toggleMilestone(goalId, msId)`, `completeGoal`, `deleteGoal`, `listGoals()` | цели и этапы |
| `addHabit({ title, emoji?, days?, target?, goalId? })`, `updateHabit`, `deleteHabit`, `moveHabit`, `listHabits()` | привычки |
| `checkHabit(habitId, date?, count?)` | отметить привычку («сделал зарядку») |
| `setHealth(date, { sleep?, water?, weight?, mood?, feeling? })`, `addWater(±n)`, `getHealth(date)` | здоровье за день («спал 7 часов», «выпил стакан воды») |
| `addWorkout({ kind, minutes, date? })`, `deleteWorkout`, `workoutsRange` | тренировки |
| `lifeToday(date)` | привычки на день с отметками + здоровье (для «что у меня сегодня?») |

Расчёты серий и статистики — `src/lib/habits.ts`.

### Поиск — `src/actions/search.ts`
| Функция | Что делает |
|---|---|
| `searchAll(query, { kinds?, perKind? })` | найти по всему приложению (только чтение): все слова запроса, без учёта регистра и «ё», примерно по основе слова; результат — `SearchHit` (вид, id, название, подпись, фрагмент, маршрут `path`) |
| `groupHits(hits)` | сгруппировать по виду в постоянном порядке |

Маршрут `path` открывает запись прямо в разделе (`/notes?open=<id>` и т. п.) — ИИ-чат сможет отвечать «вот заметка» со ссылкой.
Текстовые функции (нормализация, оценка, подсветка) — `src/lib/search.ts`.

### Резервные копии и корзина — `src/actions/backup.ts`
| Функция | Что делает |
|---|---|
| `exportAll()` | собрать копию всех данных (включая корзину) |
| `importBackup(backup, 'merge' \| 'replace')` | восстановить: объединить (новее побеждает) или заменить; отменяется одной кнопкой |
| `backupDue()`, `markBackupDone()`, `snoozeBackup()` | еженедельное напоминание о копии |
| `listTrash()`, `restoreFromTrash(table, id)`, `purgeItem(table, id)`, `emptyTrash()` | корзина |
| `autoPurgeTrash()` | удалить из корзины всё старше 30 дней (при запуске) |

Шифрование и формат файла — `src/lib/backup.ts`, файлы календаря — `src/lib/ics.ts` (`buildICS`, `birthdayItem`).
ИИ-чату эти функции **не давать**, кроме `restoreFromTrash` («верни удалённую задачу»).

### Синхронизация — `src/sync`
Не действие слоя: работает сама поверх базы. `syncNow()` — синхронизировать сейчас, `useSyncState()` — статус
(`synced` / `syncing` / `offline` / `error` / `locked` / `off`). Для Этапа 9 Supabase уже подключён — Edge Function
ИИ-посредника будет в том же проекте.

## Как будет работать ИИ-чат (Этап 9)

1. Пользователь пишет фразу → модель (или шаблонный разбор) возвращает **план**: JSON-список
   `[{ action: 'addEvent', args: {...} }, ...]` только из функций выше.
2. Приложение показывает карточку «Что я сделаю» → «Подтвердить» / «Изменить».
3. Подтверждённый план выполняется внутри одного `runAction('ИИ: …')` → отменяется одной кнопкой.
4. В модель отправляется только нужный контекст (например, `getDay(завтра)`), не вся база.

### Уровни
1. **«Без ИИ»** (офлайн, всегда): расширение `src/lib/parse.ts` — команды «перенеси…», «что у меня…», «потратил…».
2. **«Бесплатный облачный ИИ»**: запросы идут через Supabase Edge Function; ключ провайдера — в секретах функции,
   не в коде. Провайдер выбирается в настройках. Кандидаты (проверить доступность на момент Этапа 9):
   Groq (бесплатный тариф), Google Gemini (бесплатный тариф API), OpenRouter (модели `:free`),
   Cloudflare Workers AI (бесплатная квота). При исчерпании лимита или без сети — автоматически уровень 1.
3. **«ИИ на устройстве»**: WebLLM требует WebGPU; на iPhone — проверить на реальном устройстве на Этапе 9,
   если не работает стабильно — честно не делать.

Перед первым включением уровня 2 — предупреждение, что текст запросов уходит стороннему сервису.
