-- Life OS — схема облака Supabase (Этап 4.5).
-- Вставьте ВЕСЬ этот файл в Supabase → SQL Editor → New query → Run. Можно запускать повторно.
--
-- В облаке хранится только зашифрованное: поле data — шифротекст AES-GCM, ключ есть только
-- на ваших устройствах (выводится из пароля синхронизации). Открыто видны лишь служебные поля:
-- раздел (tbl), случайный id записи, время правки и признак удаления.

-- Записи всех разделов
create table if not exists public.records (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text    not null,
  id         text    not null,
  updated_at bigint  not null,          -- время правки на устройстве (мс), «новее побеждает»
  deleted    boolean not null default false,
  data       text,                      -- зашифрованная запись (base64: iv + шифротекст)
  seq        bigint  not null default 0, -- номер изменения на сервере — для «дай всё, что новее»
  primary key (user_id, tbl, id)
);

create sequence if not exists public.records_seq;
create index if not exists records_user_seq on public.records (user_id, seq);

-- Сервер сам ставит номер изменения и не даёт старой правке затереть более новую
create or replace function public.records_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- более старая правка — пропускаем, в облаке остаётся новая
  end if;
  new.seq := nextval('public.records_seq');
  return new;
end $$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();

-- «Сейф»: соль для пароля и контрольная строка, чтобы второе устройство проверило пароль
create table if not exists public.vault (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  salt       text not null,
  iterations integer not null,
  check_data text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: каждый видит и меняет только свои строки
alter table public.records enable row level security;
alter table public.vault enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own vault" on public.vault;
create policy "own vault" on public.vault for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on sequence public.records_seq to authenticated;
grant select, insert, update, delete on public.records, public.vault to authenticated;
revoke all on public.records, public.vault from anon;
