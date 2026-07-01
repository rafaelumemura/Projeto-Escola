create table if not exists public.plan_configurations (
  plan_key text primary key check (plan_key in ('free', 'basic', 'complete', 'pro')),
  activity_limit integer not null check (activity_limit >= 0),
  collection_limit integer check (collection_limit is null or collection_limit >= 0),
  printable_material_limit integer not null default 0 check (printable_material_limit >= 0),
  period_days integer not null check (period_days between 1 and 365),
  printable_material_enabled boolean not null default false,
  planning_skins_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.plan_configurations (
  plan_key,
  activity_limit,
  collection_limit,
  printable_material_limit,
  period_days,
  printable_material_enabled,
  planning_skins_enabled
)
values
  ('free', 5, 1, 0, 7, false, false),
  ('basic', 25, 5, 0, 30, false, false),
  ('complete', 100, 15, 50, 30, true, true),
  ('pro', 1000, null, 50, 30, true, true)
on conflict (plan_key) do nothing;

create table if not exists public.admin_system_settings (
  setting_key text primary key,
  encrypted_value text,
  is_secret boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (length(trim(setting_key)) > 0)
);

create table if not exists public.admin_setting_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists admin_setting_audit_logs_created_idx
  on public.admin_setting_audit_logs(created_at desc);

drop trigger if exists set_plan_configurations_updated_at on public.plan_configurations;
create trigger set_plan_configurations_updated_at
before update on public.plan_configurations
for each row execute function public.set_updated_at();

drop trigger if exists set_admin_system_settings_updated_at on public.admin_system_settings;
create trigger set_admin_system_settings_updated_at
before update on public.admin_system_settings
for each row execute function public.set_updated_at();

alter table public.plan_configurations enable row level security;
alter table public.admin_system_settings enable row level security;
alter table public.admin_setting_audit_logs enable row level security;

revoke all on table public.plan_configurations from public, anon, authenticated;
revoke all on table public.admin_system_settings from public, anon, authenticated;
revoke all on table public.admin_setting_audit_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.plan_configurations to service_role;
grant select, insert, update, delete on table public.admin_system_settings to service_role;
grant select, insert on table public.admin_setting_audit_logs to service_role;

create or replace function public.billing_plan_limit(plan_key text)
returns integer
language sql
stable
as $$
  select coalesce(
    (select configuration.activity_limit from public.plan_configurations configuration where configuration.plan_key = $1),
    0
  );
$$;

create or replace function public.billing_plan_period_days(plan_key text)
returns integer
language sql
stable
as $$
  select coalesce(
    (select configuration.period_days from public.plan_configurations configuration where configuration.plan_key = $1),
    30
  );
$$;

update public.billing_subscriptions subscription
set activity_limit = configuration.activity_limit,
    updated_at = now()
from public.plan_configurations configuration
where configuration.plan_key = subscription.plan_key
  and subscription.activity_limit is distinct from configuration.activity_limit;
