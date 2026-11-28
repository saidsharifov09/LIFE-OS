-- Life OS — уведомления при закрытом приложении. Выполнить ОДИН раз: Supabase → SQL Editor → New query → Run.
-- Готовую версию с адресом вашего проекта копирует приложение: Настройки → Уведомления → «Скопировать SQL».
-- Повторный запуск безопасен (ничего не ломает и не дублирует).

-- Будильник раз в минуту и запросы из базы к функции
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Служебные настройки: ключи VAPID (создаёт функция) и секрет будильника. Доступ — только у ключа сервиса.
create table if not exists public.push_config (
  key text primary key,
  value text not null
);

-- Подписки устройств (iPhone, ноутбук)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- Расписание напоминаний (приложение присылает ближайшие 14 дней; по умолчанию — без названий дел)
create table if not exists public.push_reminders (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  url text,
  sent boolean not null default false,
  primary key (user_id, id)
);
create index if not exists push_reminders_due on public.push_reminders (fire_at) where not sent;

-- Правила доступа: включены и без разрешений — из приложения напрямую не читается и не пишется,
-- работает только функция life-os (ключ сервиса), и только с записями вошедшего пользователя.
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_reminders enable row level security;

-- Секрет будильника (случайный, создаётся один раз)
insert into public.push_config (key, value)
values ('cron', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Будильник: каждую минуту вызывает функцию life-os
select cron.unschedule(jobid) from cron.job where jobname = 'life-os-push';
select cron.schedule('life-os-push', '* * * * *', $job$
  select net.http_post(
    url := '__FUNCTION_URL__',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.push_config where key = 'cron')
    ),
    body := '{"action":"push-tick"}'::jsonb
  );
$job$);
