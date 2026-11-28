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

## Помощник — ИИ-чат (Этап 9, готово)

Кнопка ✨ рядом с быстрой записью (на iPhone — над нижней панелью справа, на ноутбуке — под «Быстрая запись»,
клавиша `A`), а в быстрой записи — кнопка «Помощнику». Голосовой ввод — встроенная диктовка клавиатуры iPhone (🎙).

### Как это работает
1. Фраза → **разбор** (уровень 1 или 2) → `Interpretation`: `{ reply?, steps: PlanStep[], query? }` (`src/ai/plan.ts`).
2. Всё, что пришло, проходит `validateInterpretation`: только известные действия, проверенные даты/время/суммы/категории,
   не больше 10 шагов. Неизвестное (`dropAll` и т. п.) выбрасывается — ИИ физически не может вызвать что-то ещё.
3. `resolvePlan` (`src/ai/run.ts`) находит на устройстве людей («с Зариной» → Зарина, любой падеж), привычки и задачи по
   названию и пишет понятное описание шага. Не нашёл — шаг помечается и будет пропущен.
4. Карточка **«Что я сделаю»** → «Подтвердить» / «Изменить» (поправить поля, убрать шаг) / «Отмена».
5. `executePlan` выполняет шаги внутри одного `runAction('Помощник: N действий')` → **«Отменить»** откатывает весь план.
6. **Вопросы** («что у меня завтра?», «сколько потратил за неделю?», «у кого скоро ДР?», «найди…», «что просрочено?»)
   отвечаются `answerQuery` из базы на устройстве. **В ИИ данные из базы не отправляются вообще** — ИИ только переводит
   фразу в план/вопрос; в облако уходит текст фразы и сегодняшняя дата.

Действия плана: `addTask`, `addEvent`, `addExpense`, `addIncome`, `moveUnfinished`, `moveTask`, `completeTask`, `addNote`,
`addLater`, `addLogEntry`, `checkHabit`, `addWater`, `setHealth`, `addWorkout`, `addTopic`, `markContact`, `capture`.
Удаление, импорт, корзина, синхронизация помощнику недоступны — намеренно.

### Уровни (Настройки → Помощник)
1. **«Без ИИ»** — `src/ai/rules.ts`, офлайн, всегда. Понимает: встречи/созвоны с датой и временем → событие;
   «напомни…», «надо…», «купить…», фразы с датой → задача (важная — если «срочно»); «потратил 1200 на продукты»,
   «кофе 250», «+50000 зарплата» → расход/доход с категорией; «перенеси невыполненное на субботу», «перенеси задачу X на…»;
   «сделал зарядку» (привычка, иначе — задача с таким названием); «выпил 2 стакана воды», «спал 7 часов», «вес 72,5»,
   «настроение 4/отличное», «бегал 30 минут»; «обсудить с мамой…», «созвонился с Зариной»; «сегодня был в парке с Али» →
   история (с отметкой контакта); «запиши идею: …» → блокнот; ссылка или «посмотреть фильм…» → «Посмотреть позже».
   Несколько команд — с новой строки или через «;». Непонятное → предложение сохранить во «Входящие».
2. **«Облачный ИИ»** — `src/ai/cloud.ts` → ваш Supabase → функция `supabase/functions/life-os-ai/index.ts` → Groq / Gemini /
   OpenRouter. Ключ — только в секретах функции. Сервис выбирается в настройках («Авто» — любой, для которого есть ключ;
   при лимите функция сама пробует следующий). Нет сети, лимит, нет функции/ключа, непонятный ответ → **сразу уровень 1**
   и жёлтая плашка с причиной. Перед первым включением — предупреждение, что текст запросов уходит стороннему сервису.
3. **«ИИ на устройстве»** — **не сделан, честно.** WebLLM нужен WebGPU; в Safari он появился только в новых iOS,
   а самая маленькая полезная модель — это 0,5–2 ГБ загрузки и сотни МБ–ГБ памяти видеокарты. iOS закрывает вкладки,
   которые берут много памяти, а проверить на настоящем iPhone из облачной сессии нельзя. Ради разбора коротких
   команд это не окупается: уровень 1 офлайн уже покрывает частые фразы. В настройках пункт есть, с объяснением и
   проверкой «WebGPU есть/нет». Вернуться можно, когда появится маленькая модель (<300 МБ), стабильно работающая на iPhone.

### Облачный ИИ: пошагово с iPhone
Нужен подключённый Supabase (см. [SUPABASE.md](SUPABASE.md)) — функция живёт в том же проекте. Всё делается в Safari.

**Шаг 1. Бесплатный ключ ИИ (без карты).** Рекомендую Groq:
1. Откройте `console.groq.com` → войдите (Google или email).
2. **API Keys** → **Create API Key** → любое имя → скопируйте ключ (он показывается один раз). Никуда, кроме шага 3, не вставляйте —
   ни в чат, ни в приложение, ни в GitHub.

Запасные варианты: Google Gemini — ключ в `aistudio.google.com/apikey` (Google AI Studio работает не во всех странах; в России —
недоступен без VPN, для Таджикистана проверьте сами); OpenRouter — `openrouter.ai/keys`, бесплатные модели с пометкой `:free`
и небольшим дневным лимитом. Можно добавить несколько ключей — при лимите одного функция возьмёт следующий.
Запросы к ИИ идут с серверов Supabase, а не с вашего телефона, поэтому доступность сервиса в вашей стране важна только для получения ключа.

**Шаг 2. Функция в Supabase.**
1. `supabase.com/dashboard` → ваш проект → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Имя функции: `life-os-ai` (ровно так).
3. В Life OS: **Настройки → Помощник → Облачный ИИ → «Понимаю, включить» → «Скопировать код функции»**.
   В редакторе Supabase выделите всё и вставьте скопированное → **Deploy**.
4. В настройках функции выключите **Verify JWT / Enforce JWT verification**: функция сама проверяет, что вы вошли
   (через Auth вашего проекта; так работает и со старыми, и с новыми ключами Supabase).

**Шаг 3. Ключ — в секреты.** **Edge Functions → Secrets** → **Add new secret**:
- Name `GROQ_API_KEY`, Value — ключ из шага 1 → **Save**. (Для Gemini — `GEMINI_API_KEY`, для OpenRouter — `OPENROUTER_API_KEY`.)
- По желанию `ALLOWED_EMAILS` = ваш email: тогда функцией не сможет пользоваться никто другой, даже если зарегистрируется в проекте.
- Если сервис убрал модель по умолчанию — секрет `GROQ_MODEL` / `GEMINI_MODEL` / `OPENROUTER_MODEL` с именем новой модели
  (по умолчанию: `llama-3.3-70b-versatile`, `gemini-flash-latest`, `meta-llama/llama-3.3-70b-instruct:free`). Приложение менять не нужно.

**Шаг 4. Проверка.** Life OS → Настройки → Помощник → **«Проверить»** → «Облачный ИИ отвечает ✓». Если нет — текст ошибки
подскажет, чего не хватает (нет функции, нет ключа, нужно войти в облако, лимит).

Названия кнопок на сайте Supabase и Groq иногда меняются — ищите по смыслу (Edge Functions, Secrets, API Keys).
