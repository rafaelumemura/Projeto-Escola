alter table public.profiles
add column if not exists avatar_url text;

alter table public.profiles
add column if not exists is_admin boolean not null default false;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
begin
  select email into auth_email
  from auth.users
  where id = new.id;

  new.email := coalesce(auth_email, new.email);
  new.is_admin := lower(coalesce(auth_email, new.email, '')) = 'rafaelumemura@gmail.com';
  return new;
end;
$$;

drop trigger if exists sync_profile_admin_flag on public.profiles;
create trigger sync_profile_admin_flag
before insert or update on public.profiles
for each row execute function public.sync_profile_admin_flag();

update public.profiles
set is_admin = lower(coalesce(email, '')) = 'rafaelumemura@gmail.com';

update public.profiles
set plan = 'free'
where lower(coalesce(plan, '')) = 'free';

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null check (plan_key in ('free', 'basic', 'complete', 'pro')),
  status text not null default 'active' check (status in ('active', 'past_due', 'suspended', 'canceled')),
  activity_limit integer not null,
  generated_count integer not null default 0,
  current_period_start timestamp with time zone not null default now(),
  current_period_end timestamp with time zone not null,
  grace_ends_at timestamp with time zone,
  suspended_at timestamp with time zone,
  inactive_delete_after timestamp with time zone,
  canceled_at timestamp with time zone,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.billing_subscriptions
drop constraint if exists billing_subscriptions_plan_key_check;

alter table public.billing_subscriptions
add constraint billing_subscriptions_plan_key_check
check (plan_key in ('free', 'basic', 'complete', 'pro'));

create index if not exists billing_subscriptions_user_status_idx
on public.billing_subscriptions(user_id, status, current_period_end desc);

create unique index if not exists billing_subscriptions_one_open_idx
on public.billing_subscriptions(user_id)
where status in ('active', 'past_due', 'suspended');

create or replace function public.billing_plan_limit(plan_key text)
returns integer
language sql
immutable
as $$
  select case
    when plan_key = 'free' then 5
    when plan_key = 'basic' then 25
    when plan_key = 'complete' then 100
    when plan_key = 'pro' then 1000
    else 0
  end;
$$;

create or replace function public.billing_plan_period_days(plan_key text)
returns integer
language sql
immutable
as $$
  select case
    when plan_key = 'free' then 7
    when plan_key in ('basic', 'complete', 'pro') then 30
    else 30
  end;
$$;

update public.billing_subscriptions
set activity_limit = public.billing_plan_limit(plan_key),
    updated_at = now()
where plan_key in ('free', 'basic', 'complete', 'pro')
and activity_limit is distinct from public.billing_plan_limit(plan_key);

create or replace function public.activate_subscription_cycle(
  p_user_id uuid,
  p_plan_key text,
  p_provider text default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_started_at timestamp with time zone default now()
)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  active_subscription public.billing_subscriptions;
  updated_subscription public.billing_subscriptions;
  plan_limit integer;
  period_days integer;
begin
  if p_plan_key not in ('free', 'basic', 'complete', 'pro') then
    raise exception 'Plano inválido.';
  end if;

  plan_limit := public.billing_plan_limit(p_plan_key);
  period_days := public.billing_plan_period_days(p_plan_key);

  select *
  into active_subscription
  from public.billing_subscriptions
  where user_id = p_user_id
  and status in ('active', 'past_due', 'suspended')
  order by created_at desc
  limit 1;

  if active_subscription.id is null then
    insert into public.billing_subscriptions (
      user_id,
      plan_key,
      status,
      activity_limit,
      generated_count,
      current_period_start,
      current_period_end,
      grace_ends_at,
      provider,
      provider_customer_id,
      provider_subscription_id
    )
    values (
      p_user_id,
      p_plan_key,
      'active',
      plan_limit,
      0,
      p_started_at,
      p_started_at + make_interval(days => period_days),
      p_started_at + make_interval(days => period_days + 1),
      p_provider,
      p_provider_customer_id,
      p_provider_subscription_id
    )
    returning * into updated_subscription;
  else
    update public.billing_subscriptions
    set
      plan_key = p_plan_key,
      status = 'active',
      activity_limit = plan_limit,
      generated_count = 0,
      current_period_start = p_started_at,
      current_period_end = p_started_at + make_interval(days => period_days),
      grace_ends_at = p_started_at + make_interval(days => period_days + 1),
      suspended_at = null,
      inactive_delete_after = null,
      canceled_at = null,
      provider = coalesce(p_provider, provider),
      provider_customer_id = coalesce(p_provider_customer_id, provider_customer_id),
      provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id),
      updated_at = now()
    where id = active_subscription.id
    returning * into updated_subscription;
  end if;

  update public.profiles
  set plan = p_plan_key
  where id = p_user_id;

  return updated_subscription;
end;
$$;

create or replace function public.upgrade_subscription_to_complete(
  p_user_id uuid,
  p_provider text default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null
)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  active_subscription public.billing_subscriptions;
  updated_subscription public.billing_subscriptions;
begin
  select *
  into active_subscription
  from public.billing_subscriptions
  where user_id = p_user_id
  and status = 'active'
  order by created_at desc
  limit 1;

  if active_subscription.id is null then
    return public.activate_subscription_cycle(
      p_user_id,
      'complete',
      p_provider,
      p_provider_customer_id,
      p_provider_subscription_id,
      now()
    );
  end if;

  update public.billing_subscriptions
  set
    plan_key = 'complete',
    activity_limit = public.billing_plan_limit('complete'),
    generated_count = least(generated_count, public.billing_plan_limit('complete')),
    provider = coalesce(p_provider, provider),
    provider_customer_id = coalesce(p_provider_customer_id, provider_customer_id),
    provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id),
    updated_at = now()
  where id = active_subscription.id
  returning * into updated_subscription;

  update public.profiles
  set plan = 'complete'
  where id = p_user_id;

  return updated_subscription;
end;
$$;

create or replace function public.billing_maintenance()
returns table(suspended_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  suspended_total integer := 0;
  deleted_total integer := 0;
begin
  update public.billing_subscriptions
  set
    status = 'past_due',
    grace_ends_at = coalesce(grace_ends_at, current_period_end + interval '1 day'),
    updated_at = now()
  where status = 'active'
  and current_period_end < now();

  update public.billing_subscriptions
  set
    status = 'suspended',
    suspended_at = coalesce(suspended_at, now()),
    inactive_delete_after = coalesce(inactive_delete_after, now() + interval '30 days'),
    updated_at = now()
  where status = 'past_due'
  and coalesce(grace_ends_at, current_period_end + interval '1 day') < now();

  get diagnostics suspended_total = row_count;

  with users_to_delete as (
    select user_id
    from public.billing_subscriptions
    where status = 'suspended'
    and inactive_delete_after is not null
    and inactive_delete_after < now()
  ),
  deleted_users as (
    delete from auth.users
    where id in (select user_id from users_to_delete)
    returning id
  )
  select count(*) into deleted_total from deleted_users;

  return query select suspended_total, deleted_total;
end;
$$;

revoke execute on function public.activate_subscription_cycle(uuid, text, text, text, text, timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.upgrade_subscription_to_complete(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.billing_maintenance() from public, anon, authenticated;

grant execute on function public.activate_subscription_cycle(uuid, text, text, text, text, timestamp with time zone) to service_role;
grant execute on function public.upgrade_subscription_to_complete(uuid, text, text, text) to service_role;
grant execute on function public.billing_maintenance() to service_role;

do $$
declare
  admin_id uuid;
  activity_count integer := 0;
  subscription_id uuid;
begin
  select id into admin_id
  from auth.users
  where lower(email) = 'rafaelumemura@gmail.com'
  limit 1;

  if admin_id is not null then
    update public.profiles
    set plan = 'pro',
        is_admin = true
    where id = admin_id;

    select count(*) into activity_count
    from public.activities
    where user_id = admin_id;

    select id into subscription_id
    from public.billing_subscriptions
    where user_id = admin_id
    order by created_at desc
    limit 1;

    if subscription_id is null then
      insert into public.billing_subscriptions (
        user_id,
        plan_key,
        status,
        activity_limit,
        generated_count,
        current_period_start,
        current_period_end,
        grace_ends_at
      )
      values (
        admin_id,
        'pro',
        'active',
        1000,
        activity_count,
        now(),
        now() + interval '30 days',
        now() + interval '31 days'
      );
    else
      update public.billing_subscriptions
      set plan_key = 'pro',
          status = 'active',
          activity_limit = 1000,
          generated_count = greatest(generated_count, activity_count),
          current_period_start = case when current_period_end < now() then now() else current_period_start end,
          current_period_end = case when current_period_end < now() then now() + interval '30 days' else current_period_end end,
          grace_ends_at = case when current_period_end < now() then now() + interval '31 days' else grace_ends_at end,
          suspended_at = null,
          inactive_delete_after = null,
          canceled_at = null,
          updated_at = now()
      where id = subscription_id;
    end if;
  end if;
end $$;

drop trigger if exists set_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger set_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

alter table public.billing_subscriptions enable row level security;

drop policy if exists "billing_subscriptions_select_own" on public.billing_subscriptions;
create policy "billing_subscriptions_select_own"
on public.billing_subscriptions for select
using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
