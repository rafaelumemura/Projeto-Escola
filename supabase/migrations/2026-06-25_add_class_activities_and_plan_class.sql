alter table public.weekly_plans
add column if not exists class_id uuid references public.classes(id) on delete set null;

create index if not exists weekly_plans_user_class_idx
on public.weekly_plans(user_id, class_id, start_date, end_date);

create or replace function public.ensure_weekly_plan_class_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.classes c
    where c.id = new.class_id and c.user_id = new.user_id
  ) then
    raise exception 'A turma informada nao pertence ao usuario.';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_weekly_plan_class_owner_trigger on public.weekly_plans;
create trigger ensure_weekly_plan_class_owner_trigger
before insert or update on public.weekly_plans
for each row execute function public.ensure_weekly_plan_class_owner();

create table if not exists public.class_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (class_id, activity_id)
);

create index if not exists class_activities_user_class_idx
on public.class_activities(user_id, class_id, created_at desc);

create index if not exists class_activities_activity_idx
on public.class_activities(activity_id);

alter table public.class_activities enable row level security;

drop policy if exists "class_activities_select_own" on public.class_activities;
create policy "class_activities_select_own" on public.class_activities
for select using (auth.uid() = user_id);

drop policy if exists "class_activities_insert_own" on public.class_activities;
create policy "class_activities_insert_own" on public.class_activities
for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  )
  and exists (
    select 1 from public.activities a
    where a.id = activity_id and a.user_id = auth.uid()
  )
);

drop policy if exists "class_activities_delete_own" on public.class_activities;
create policy "class_activities_delete_own" on public.class_activities
for delete using (auth.uid() = user_id);
