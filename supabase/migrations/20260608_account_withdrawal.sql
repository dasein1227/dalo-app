begin;

create extension if not exists pgcrypto;

create table if not exists public.account_withdrawal_reasons (
  code text primary key,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_withdrawal_reasons_code_check check (code in ('difficult', 'inactive', 'missing_features', 'notifications', 'bugs', 'privacy', 'other'))
);

create table if not exists public.account_withdrawal_reason_i18n (
  reason_code text not null references public.account_withdrawal_reasons(code) on delete cascade,
  lang text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reason_code, lang)
);

create table if not exists public.account_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  user_hash text null,
  reason_code text not null references public.account_withdrawal_reasons(code),
  reason_text text null,
  locale text null,
  status text not null default 'withdrawn',
  app_version text null,
  platform text null,
  requested_at timestamptz not null default now(),
  auth_delete_due_at timestamptz not null default (now() + interval '7 days'),
  auth_deleted_at timestamptz null,
  identifier_release_at timestamptz not null default (now() + interval '30 days'),
  media_delete_due_at timestamptz not null default (now() + interval '30 days'),
  reason_text_purge_at timestamptz not null default (now() + interval '180 days'),
  security_log_purge_at timestamptz not null default (now() + interval '365 days'),
  failure_message text null,
  updated_at timestamptz not null default now(),
  constraint account_withdrawal_requests_status_check check (status in ('withdrawn', 'auth_deleted', 'failed')),
  constraint account_withdrawal_requests_reason_text_len check (reason_text is null or char_length(reason_text) <= 500)
);

create unique index if not exists account_withdrawal_requests_active_user_uidx
  on public.account_withdrawal_requests(user_id)
  where user_id is not null and status = 'withdrawn';

create table if not exists public.account_identifier_locks (
  id uuid primary key default gen_random_uuid(),
  identifier_type text not null,
  identifier_value text not null,
  normalized_value text not null,
  source_user_hash text null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  constraint account_identifier_locks_type_check check (identifier_type in ('follow_id', 'coonn_id', 'friend_code')),
  constraint account_identifier_locks_value_check check (char_length(normalized_value) between 3 and 30)
);

create unique index if not exists account_identifier_locks_type_value_uidx
  on public.account_identifier_locks(identifier_type, normalized_value);

create index if not exists account_identifier_locks_until_idx
  on public.account_identifier_locks(locked_until);

create table if not exists public.account_rejoin_locks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  subject_hash text not null,
  email_hash text null,
  locked_until timestamptz not null,
  source_user_hash text null,
  created_at timestamptz not null default now()
);

create unique index if not exists account_rejoin_locks_provider_subject_uidx
  on public.account_rejoin_locks(provider, subject_hash);

create index if not exists account_rejoin_locks_until_idx
  on public.account_rejoin_locks(locked_until);

alter table public.account_withdrawal_reasons enable row level security;
alter table public.account_withdrawal_reason_i18n enable row level security;
alter table public.account_withdrawal_requests enable row level security;
alter table public.account_identifier_locks enable row level security;
alter table public.account_rejoin_locks enable row level security;

revoke all on table public.account_withdrawal_requests from anon, authenticated;
revoke all on table public.account_identifier_locks from anon, authenticated;
revoke all on table public.account_rejoin_locks from anon, authenticated;

insert into public.account_withdrawal_reasons (code, sort_order, active)
values
  ('difficult', 10, true),
  ('inactive', 20, true),
  ('missing_features', 30, true),
  ('notifications', 40, true),
  ('bugs', 50, true),
  ('privacy', 60, true),
  ('other', 70, true)
on conflict (code) do update set
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

insert into public.account_withdrawal_reason_i18n (reason_code, lang, label)
values
  ('difficult','ko','사용이 어려워요'),('inactive','ko','자주 사용하지 않아요'),('missing_features','ko','원하는 기능이 부족해요'),('notifications','ko','알림이 불편해요'),('bugs','ko','오류가 있어요'),('privacy','ko','개인정보가 걱정돼요'),('other','ko','기타'),
  ('difficult','en','Hard to use'),('inactive','en','I do not use it often'),('missing_features','en','Missing features I need'),('notifications','en','Notifications are distracting'),('bugs','en','I found errors'),('privacy','en','Privacy concerns'),('other','en','Other'),
  ('difficult','ja','使いにくい'),('inactive','ja','あまり使わない'),('missing_features','ja','必要な機能が足りない'),('notifications','ja','通知が気になる'),('bugs','ja','不具合がある'),('privacy','ja','プライバシーが気になる'),('other','ja','その他'),
  ('difficult','zh-Hans','使用不方便'),('inactive','zh-Hans','不常使用'),('missing_features','zh-Hans','缺少需要的功能'),('notifications','zh-Hans','通知打扰'),('bugs','zh-Hans','遇到错误'),('privacy','zh-Hans','担心隐私'),('other','zh-Hans','其他'),
  ('difficult','zh-Hant','使用不方便'),('inactive','zh-Hant','不常使用'),('missing_features','zh-Hant','缺少需要的功能'),('notifications','zh-Hant','通知打擾'),('bugs','zh-Hant','遇到錯誤'),('privacy','zh-Hant','擔心隱私'),('other','zh-Hant','其他'),
  ('difficult','es','Es difícil de usar'),('inactive','es','No lo uso a menudo'),('missing_features','es','Faltan funciones que necesito'),('notifications','es','Las notificaciones molestan'),('bugs','es','Encontré errores'),('privacy','es','Me preocupa la privacidad'),('other','es','Otro'),
  ('difficult','pt','É difícil de usar'),('inactive','pt','Não uso com frequência'),('missing_features','pt','Faltam recursos necessários'),('notifications','pt','As notificações incomodam'),('bugs','pt','Encontrei erros'),('privacy','pt','Preocupações com privacidade'),('other','pt','Outro'),
  ('difficult','fr','Difficile à utiliser'),('inactive','fr','Je l’utilise peu'),('missing_features','fr','Fonctions manquantes'),('notifications','fr','Notifications gênantes'),('bugs','fr','J’ai rencontré des erreurs'),('privacy','fr','Confidentialité'),('other','fr','Autre'),
  ('difficult','de','Schwer zu verwenden'),('inactive','de','Ich nutze es selten'),('missing_features','de','Wichtige Funktionen fehlen'),('notifications','de','Benachrichtigungen stören'),('bugs','de','Ich habe Fehler gefunden'),('privacy','de','Datenschutzbedenken'),('other','de','Sonstiges'),
  ('difficult','id','Sulit digunakan'),('inactive','id','Jarang digunakan'),('missing_features','id','Fitur yang dibutuhkan kurang'),('notifications','id','Notifikasi mengganggu'),('bugs','id','Ada kesalahan'),('privacy','id','Khawatir soal privasi'),('other','id','Lainnya'),
  ('difficult','hi','उपयोग करना कठिन है'),('inactive','hi','मैं अक्सर उपयोग नहीं करता'),('missing_features','hi','ज़रूरी सुविधाएँ नहीं हैं'),('notifications','hi','सूचनाएँ असुविधाजनक हैं'),('bugs','hi','त्रुटियाँ हैं'),('privacy','hi','गोपनीयता की चिंता है'),('other','hi','अन्य'),
  ('difficult','ru','Сложно пользоваться'),('inactive','ru','Редко пользуюсь'),('missing_features','ru','Не хватает нужных функций'),('notifications','ru','Уведомления мешают'),('bugs','ru','Есть ошибки'),('privacy','ru','Вопросы конфиденциальности'),('other','ru','Другое'),
  ('difficult','ar','الاستخدام صعب'),('inactive','ar','لا أستخدمه كثيرًا'),('missing_features','ar','تنقصه ميزات أحتاجها'),('notifications','ar','الإشعارات مزعجة'),('bugs','ar','وجدت أخطاء'),('privacy','ar','لدي مخاوف بشأن الخصوصية'),('other','ar','أخرى'),
  ('difficult','vi','Khó sử dụng'),('inactive','vi','Tôi không dùng thường xuyên'),('missing_features','vi','Thiếu tính năng cần thiết'),('notifications','vi','Thông báo gây phiền'),('bugs','vi','Có lỗi'),('privacy','vi','Lo ngại quyền riêng tư'),('other','vi','Khác'),
  ('difficult','tr','Kullanımı zor'),('inactive','tr','Sık kullanmıyorum'),('missing_features','tr','Gerekli özellikler eksik'),('notifications','tr','Bildirimler rahatsız ediyor'),('bugs','tr','Hatalar var'),('privacy','tr','Gizlilik endişesi'),('other','tr','Diğer'),
  ('difficult','th','ใช้งานยาก'),('inactive','th','ไม่ค่อยได้ใช้'),('missing_features','th','ขาดฟีเจอร์ที่ต้องการ'),('notifications','th','การแจ้งเตือนรบกวน'),('bugs','th','พบข้อผิดพลาด'),('privacy','th','กังวลเรื่องความเป็นส่วนตัว'),('other','th','อื่น ๆ'),
  ('difficult','it','Difficile da usare'),('inactive','it','Lo uso poco'),('missing_features','it','Mancano funzioni utili'),('notifications','it','Le notifiche disturbano'),('bugs','it','Ho trovato errori'),('privacy','it','Dubbi sulla privacy'),('other','it','Altro')
on conflict (reason_code, lang) do update set
  label = excluded.label,
  updated_at = now();

create or replace function public._coonn_column_exists(p_table text, p_column text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function public._coonn_table_exists(p_table text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select to_regclass('public.' || p_table) is not null;
$$;

alter table public.profiles
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawal_requested_at timestamptz,
  add column if not exists auth_delete_due_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists account_status text not null default 'active';

create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_auth_delete_due_at_idx on public.profiles(auth_delete_due_at);

create or replace function public._coonn_normalize_lang(p_lang text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_lang is null or btrim(p_lang) = '' then 'en'
    when lower(replace(p_lang, '_', '-')) in ('zh-cn', 'zh-hans') then 'zh-Hans'
    when lower(replace(p_lang, '_', '-')) in ('zh-tw', 'zh-hk', 'zh-mo', 'zh-hant') then 'zh-Hant'
    else split_part(lower(replace(p_lang, '_', '-')), '-', 1)
  end;
$$;

create or replace function public.get_account_withdrawal_reasons_v1(p_lang text default 'en')
returns table(reason_code text, label text, sort_order integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with lang_input as (
    select public._coonn_normalize_lang(p_lang) as lang
  )
  select
    r.code as reason_code,
    coalesce(t.label, ten.label, tko.label, r.code) as label,
    r.sort_order
  from public.account_withdrawal_reasons r
  cross join lang_input li
  left join public.account_withdrawal_reason_i18n t on t.reason_code = r.code and t.lang = li.lang
  left join public.account_withdrawal_reason_i18n ten on ten.reason_code = r.code and ten.lang = 'en'
  left join public.account_withdrawal_reason_i18n tko on tko.reason_code = r.code and tko.lang = 'ko'
  where r.active = true
  order by r.sort_order asc;
$$;

grant execute on function public.get_account_withdrawal_reasons_v1(text) to authenticated;

create or replace function public.check_profile_identifier_available(p_field text, p_value text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_field text := lower(btrim(coalesce(p_field, '')));
  v_value text := lower(btrim(coalesce(p_value, '')));
  v_exists boolean := false;
begin
  if v_field not in ('follow_id', 'friend_code', 'coonn_id') then
    return false;
  end if;

  if v_value !~ '^[a-z0-9_]{3,30}$' then
    return false;
  end if;

  select exists (
    select 1
    from public.account_identifier_locks l
    where l.identifier_type = v_field
      and l.normalized_value = v_value
      and l.locked_until > now()
  ) into v_exists;

  if v_exists then
    return false;
  end if;

  if public._coonn_column_exists('profiles', v_field) then
    execute format('select exists (select 1 from public.profiles where lower(%I::text) = $1 and coalesce(account_status, ''active'') <> ''withdrawn'')', v_field)
    into v_exists
    using v_value;

    if v_exists then
      return false;
    end if;
  end if;

  return true;
end;
$$;

grant execute on function public.check_profile_identifier_available(text, text) to authenticated;

create or replace function public.request_account_withdrawal_v1(
  p_user_id uuid,
  p_reason_code text,
  p_reason_text text default null,
  p_locale text default null,
  p_app_version text default null,
  p_platform text default null,
  p_provider_locks jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_user_hash text;
  v_identifier_release_at timestamptz := now() + interval '30 days';
  v_auth_delete_due_at timestamptz := now() + interval '7 days';
  v_reason_text text := nullif(btrim(coalesce(p_reason_text, '')), '');
  v_where_sql text;
  v_follow_id text;
  v_friend_code text;
  v_coonn_id text;
  v_lock record;
  v_col text;
  v_table text;
  v_user_col text;
begin
  if p_user_id is null then
    raise exception 'missing_user';
  end if;

  if not exists (select 1 from public.account_withdrawal_reasons where code = p_reason_code and active = true) then
    raise exception 'invalid_reason';
  end if;

  if p_reason_code = 'other' and v_reason_text is null then
    raise exception 'missing_reason_text';
  end if;

  if v_reason_text is not null and char_length(v_reason_text) > 500 then
    raise exception 'reason_text_too_long';
  end if;

  v_user_hash := encode(digest(p_user_id::text, 'sha256'), 'hex');

  if public._coonn_column_exists('profiles', 'user_id') then
    v_where_sql := 'user_id = $1';
  else
    v_where_sql := 'id = $1';
  end if;

  if public._coonn_column_exists('profiles', 'follow_id') then
    execute 'select lower(nullif(btrim(follow_id::text), '''')) from public.profiles where ' || v_where_sql || ' limit 1'
    into v_follow_id
    using p_user_id;
  end if;

  if public._coonn_column_exists('profiles', 'friend_code') then
    execute 'select lower(nullif(btrim(friend_code::text), '''')) from public.profiles where ' || v_where_sql || ' limit 1'
    into v_friend_code
    using p_user_id;
  end if;

  if public._coonn_column_exists('profiles', 'coonn_id') then
    execute 'select lower(nullif(btrim(coonn_id::text), '''')) from public.profiles where ' || v_where_sql || ' limit 1'
    into v_coonn_id
    using p_user_id;
  end if;

  insert into public.account_withdrawal_requests (
    user_id,
    user_hash,
    reason_code,
    reason_text,
    locale,
    status,
    app_version,
    platform,
    auth_delete_due_at,
    identifier_release_at,
    media_delete_due_at,
    reason_text_purge_at,
    security_log_purge_at
  ) values (
    p_user_id,
    v_user_hash,
    p_reason_code,
    v_reason_text,
    public._coonn_normalize_lang(p_locale),
    'withdrawn',
    p_app_version,
    p_platform,
    v_auth_delete_due_at,
    v_identifier_release_at,
    now() + interval '30 days',
    now() + interval '180 days',
    now() + interval '365 days'
  )
  on conflict (user_id) where user_id is not null and status = 'withdrawn'
  do update set
    reason_code = excluded.reason_code,
    reason_text = excluded.reason_text,
    locale = excluded.locale,
    app_version = excluded.app_version,
    platform = excluded.platform,
    updated_at = now()
  returning id into v_request_id;

  if v_follow_id is not null then
    insert into public.account_identifier_locks(identifier_type, identifier_value, normalized_value, source_user_hash, locked_until)
    values ('follow_id', v_follow_id, v_follow_id, v_user_hash, v_identifier_release_at)
    on conflict (identifier_type, normalized_value) do update set locked_until = excluded.locked_until, source_user_hash = excluded.source_user_hash;
  end if;

  if v_coonn_id is not null then
    insert into public.account_identifier_locks(identifier_type, identifier_value, normalized_value, source_user_hash, locked_until)
    values ('coonn_id', v_coonn_id, v_coonn_id, v_user_hash, v_identifier_release_at)
    on conflict (identifier_type, normalized_value) do update set locked_until = excluded.locked_until, source_user_hash = excluded.source_user_hash;
  end if;

  if v_friend_code is not null then
    insert into public.account_identifier_locks(identifier_type, identifier_value, normalized_value, source_user_hash, locked_until)
    values ('friend_code', v_friend_code, v_friend_code, v_user_hash, v_identifier_release_at)
    on conflict (identifier_type, normalized_value) do update set locked_until = excluded.locked_until, source_user_hash = excluded.source_user_hash;
  end if;

  for v_lock in
    select * from jsonb_to_recordset(coalesce(p_provider_locks, '[]'::jsonb)) as x(provider text, subject_hash text, email_hash text)
  loop
    if nullif(btrim(v_lock.provider), '') is not null and nullif(btrim(v_lock.subject_hash), '') is not null then
      insert into public.account_rejoin_locks(provider, subject_hash, email_hash, locked_until, source_user_hash)
      values (lower(v_lock.provider), v_lock.subject_hash, nullif(v_lock.email_hash, ''), v_auth_delete_due_at, v_user_hash)
      on conflict (provider, subject_hash) do update set
        email_hash = coalesce(excluded.email_hash, public.account_rejoin_locks.email_hash),
        locked_until = excluded.locked_until,
        source_user_hash = excluded.source_user_hash;
    end if;
  end loop;

  execute 'update public.profiles set account_status = ''withdrawn'', withdrawn_at = now(), withdrawal_requested_at = now(), auth_delete_due_at = $2, deleted_at = now(), deleted_reason = ''user_withdrawal'', updated_at = now() where ' || v_where_sql
  using p_user_id, v_auth_delete_due_at;

  foreach v_col in array array[
    'nickname',
    'avatar_url',
    'private_avatar_url',
    'cover_url',
    'status_message',
    'bio',
    'follow_id',
    'coonn_id',
    'friend_code',
    'phone_number'
  ]
  loop
    if public._coonn_column_exists('profiles', v_col) then
      execute format('update public.profiles set %I = null where ' || v_where_sql, v_col) using p_user_id;
    end if;
  end loop;

  if public._coonn_column_exists('profiles', 'phone_verified') then
    execute 'update public.profiles set phone_verified = false where ' || v_where_sql using p_user_id;
  end if;

  if public._coonn_table_exists('push_tokens') and public._coonn_column_exists('push_tokens', 'user_id') then
    delete from public.push_tokens where user_id = p_user_id;
  end if;

  if public._coonn_table_exists('friend_meta') then
    delete from public.friend_meta where owner_user_id = p_user_id or friend_user_id = p_user_id;
  end if;

  if public._coonn_table_exists('chat_members') and public._coonn_column_exists('chat_members', 'user_id') then
    update public.chat_members
       set active = false,
           left_at = coalesce(left_at, now())
     where user_id = p_user_id;
  end if;

  foreach v_table in array array['notification_outbox', 'notification_deliveries']
  loop
    if public._coonn_table_exists(v_table) then
      foreach v_user_col in array array['user_id', 'target_user_id', 'recipient_user_id']
      loop
        if public._coonn_column_exists(v_table, v_user_col) then
          execute format('delete from public.%I where %I = $1', v_table, v_user_col) using p_user_id;
        end if;
      end loop;
    end if;
  end loop;

  return v_request_id;
end;
$$;

revoke all on function public.request_account_withdrawal_v1(uuid, text, text, text, text, text, jsonb) from anon, authenticated;

create or replace function public.list_due_account_auth_deletions_v1(p_limit integer default 50)
returns table(request_id uuid, user_id uuid)
language sql
security definer
set search_path to 'public'
as $$
  select id as request_id, user_id
  from public.account_withdrawal_requests
  where status = 'withdrawn'
    and user_id is not null
    and auth_deleted_at is null
    and auth_delete_due_at <= now()
  order by auth_delete_due_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_due_account_auth_deletions_v1(integer) from anon, authenticated;

create or replace function public.mark_account_auth_deleted_v1(p_request_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_hash text;
begin
  v_user_hash := encode(digest(p_user_id::text, 'sha256'), 'hex');

  update public.account_withdrawal_requests
     set status = 'auth_deleted',
         user_hash = coalesce(user_hash, v_user_hash),
         user_id = null,
         auth_deleted_at = now(),
         updated_at = now()
   where id = p_request_id
     and user_id = p_user_id;
end;
$$;

revoke all on function public.mark_account_auth_deleted_v1(uuid, uuid) from anon, authenticated;

create or replace function public.mark_account_auth_delete_failed_v1(p_request_id uuid, p_failure_message text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.account_withdrawal_requests
     set failure_message = left(coalesce(p_failure_message, 'unknown'), 1000),
         updated_at = now()
   where id = p_request_id;
$$;

revoke all on function public.mark_account_auth_delete_failed_v1(uuid, text) from anon, authenticated;

commit;
