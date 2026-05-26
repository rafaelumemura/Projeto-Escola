create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  plan text not null default 'free',
  created_at timestamp with time zone not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  age_range text,
  methodology text,
  development_area text,
  activity_type text,
  environment text,
  materials text,
  objective text,
  estimated_time text,
  bncc_code text,
  description text,
  steps jsonb,
  teacher_tips jsonb,
  variations jsonb,
  safety_notes text,
  evaluation text,
  raw_ai_response jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.collection_activities (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (collection_id, activity_id)
);

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_date date,
  end_date date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  date date not null,
  start_time time,
  end_time time,
  notes text,
  created_at timestamp with time zone not null default now()
);

create index if not exists activities_user_created_idx on public.activities(user_id, created_at desc);
create index if not exists collections_user_created_idx on public.collections(user_id, created_at desc);
create index if not exists weekly_plans_user_created_idx on public.weekly_plans(user_id, created_at desc);
create index if not exists weekly_plan_items_plan_date_idx on public.weekly_plan_items(weekly_plan_id, date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_activities_updated_at on public.activities;
create trigger set_activities_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

drop trigger if exists set_collections_updated_at on public.collections;
create trigger set_collections_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

drop trigger if exists set_weekly_plans_updated_at on public.weekly_plans;
create trigger set_weekly_plans_updated_at
before update on public.weekly_plans
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.collections enable row level security;
alter table public.collection_activities enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "activities_select_own" on public.activities;
create policy "activities_select_own"
on public.activities for select
using (user_id = auth.uid());

drop policy if exists "activities_insert_own" on public.activities;
create policy "activities_insert_own"
on public.activities for insert
with check (user_id = auth.uid());

drop policy if exists "activities_update_own" on public.activities;
create policy "activities_update_own"
on public.activities for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "activities_delete_own" on public.activities;
create policy "activities_delete_own"
on public.activities for delete
using (user_id = auth.uid());

drop policy if exists "collections_select_own" on public.collections;
create policy "collections_select_own"
on public.collections for select
using (user_id = auth.uid());

drop policy if exists "collections_insert_own" on public.collections;
create policy "collections_insert_own"
on public.collections for insert
with check (user_id = auth.uid());

drop policy if exists "collections_update_own" on public.collections;
create policy "collections_update_own"
on public.collections for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "collections_delete_own" on public.collections;
create policy "collections_delete_own"
on public.collections for delete
using (user_id = auth.uid());

drop policy if exists "collection_activities_select_own" on public.collection_activities;
create policy "collection_activities_select_own"
on public.collection_activities for select
using (
  exists (
    select 1 from public.collections
    where collections.id = collection_activities.collection_id
    and collections.user_id = auth.uid()
  )
);

drop policy if exists "collection_activities_insert_own" on public.collection_activities;
create policy "collection_activities_insert_own"
on public.collection_activities for insert
with check (
  exists (
    select 1 from public.collections
    where collections.id = collection_activities.collection_id
    and collections.user_id = auth.uid()
  )
  and exists (
    select 1 from public.activities
    where activities.id = collection_activities.activity_id
    and activities.user_id = auth.uid()
  )
);

drop policy if exists "collection_activities_delete_own" on public.collection_activities;
create policy "collection_activities_delete_own"
on public.collection_activities for delete
using (
  exists (
    select 1 from public.collections
    where collections.id = collection_activities.collection_id
    and collections.user_id = auth.uid()
  )
);

drop policy if exists "weekly_plans_select_own" on public.weekly_plans;
create policy "weekly_plans_select_own"
on public.weekly_plans for select
using (user_id = auth.uid());

drop policy if exists "weekly_plans_insert_own" on public.weekly_plans;
create policy "weekly_plans_insert_own"
on public.weekly_plans for insert
with check (user_id = auth.uid());

drop policy if exists "weekly_plans_update_own" on public.weekly_plans;
create policy "weekly_plans_update_own"
on public.weekly_plans for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "weekly_plans_delete_own" on public.weekly_plans;
create policy "weekly_plans_delete_own"
on public.weekly_plans for delete
using (user_id = auth.uid());

drop policy if exists "weekly_plan_items_select_own" on public.weekly_plan_items;
create policy "weekly_plan_items_select_own"
on public.weekly_plan_items for select
using (
  exists (
    select 1 from public.weekly_plans
    where weekly_plans.id = weekly_plan_items.weekly_plan_id
    and weekly_plans.user_id = auth.uid()
  )
);

drop policy if exists "weekly_plan_items_insert_own" on public.weekly_plan_items;
create policy "weekly_plan_items_insert_own"
on public.weekly_plan_items for insert
with check (
  exists (
    select 1 from public.weekly_plans
    where weekly_plans.id = weekly_plan_items.weekly_plan_id
    and weekly_plans.user_id = auth.uid()
  )
  and (
    weekly_plan_items.activity_id is null
    or exists (
      select 1 from public.activities
      where activities.id = weekly_plan_items.activity_id
      and activities.user_id = auth.uid()
    )
  )
);

drop policy if exists "weekly_plan_items_update_own" on public.weekly_plan_items;
create policy "weekly_plan_items_update_own"
on public.weekly_plan_items for update
using (
  exists (
    select 1 from public.weekly_plans
    where weekly_plans.id = weekly_plan_items.weekly_plan_id
    and weekly_plans.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.weekly_plans
    where weekly_plans.id = weekly_plan_items.weekly_plan_id
    and weekly_plans.user_id = auth.uid()
  )
  and (
    weekly_plan_items.activity_id is null
    or exists (
      select 1 from public.activities
      where activities.id = weekly_plan_items.activity_id
      and activities.user_id = auth.uid()
    )
  )
);

drop policy if exists "weekly_plan_items_delete_own" on public.weekly_plan_items;
create policy "weekly_plan_items_delete_own"
on public.weekly_plan_items for delete
using (
  exists (
    select 1 from public.weekly_plans
    where weekly_plans.id = weekly_plan_items.weekly_plan_id
    and weekly_plans.user_id = auth.uid()
  )
);
