alter table public.billing_subscriptions
add column if not exists provider_product_id text,
add column if not exists provider_offer_code text,
add column if not exists last_provider_event_id text,
add column if not exists last_payment_transaction_id text,
add column if not exists next_charge_at timestamp with time zone,
add column if not exists status_reason text,
add column if not exists cancel_at_period_end boolean not null default false;

create index if not exists billing_subscriptions_provider_subscription_idx
on public.billing_subscriptions(provider, provider_subscription_id)
where provider_subscription_id is not null;

create table if not exists public.hotmart_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  transaction_id text,
  subscription_id text,
  buyer_email text,
  product_id text,
  offer_code text,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null,
  result jsonb,
  last_error text,
  attempt_count integer not null default 1,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

create index if not exists hotmart_events_type_received_idx
on public.hotmart_events(event_type, received_at desc);

create index if not exists hotmart_events_email_received_idx
on public.hotmart_events(lower(buyer_email), received_at desc)
where buyer_email is not null;

drop trigger if exists set_hotmart_events_updated_at on public.hotmart_events;
create trigger set_hotmart_events_updated_at
before update on public.hotmart_events
for each row execute function public.set_updated_at();

alter table public.hotmart_events enable row level security;

create or replace function public.apply_hotmart_subscription_activation(
  p_user_id uuid,
  p_plan_key text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_product_id text default null,
  p_offer_code text default null,
  p_event_id text default null,
  p_transaction_id text default null,
  p_started_at timestamp with time zone default now(),
  p_period_end timestamp with time zone default null
)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = public
as $pe_apply_hotmart_activation$
declare
  current_subscription public.billing_subscriptions;
  updated_subscription public.billing_subscriptions;
  plan_limit integer;
  period_days integer;
  starts_new_cycle boolean;
  effective_period_end timestamp with time zone;
begin
  if p_plan_key not in ('basic', 'complete', 'pro') then
    raise exception 'Plano pago inválido.';
  end if;

  plan_limit := public.billing_plan_limit(p_plan_key);
  period_days := public.billing_plan_period_days(p_plan_key);
  effective_period_end := case
    when p_period_end is not null and p_period_end > p_started_at then p_period_end
    else p_started_at + make_interval(days => period_days)
  end;

  select *
  into current_subscription
  from public.billing_subscriptions
  where user_id = p_user_id
    and status in ('active', 'past_due', 'suspended')
  order by created_at desc
  limit 1
  for update;

  starts_new_cycle :=
    current_subscription.id is null
    or current_subscription.current_period_end <= p_started_at
    or current_subscription.plan_key = 'free'
    or coalesce(current_subscription.provider, '') <> 'hotmart'
    or (
      current_subscription.plan_key = p_plan_key
      and p_transaction_id is not null
      and current_subscription.last_payment_transaction_id is distinct from p_transaction_id
    );

  if current_subscription.id is null then
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
      provider_subscription_id,
      provider_product_id,
      provider_offer_code,
      last_provider_event_id,
      last_payment_transaction_id,
      next_charge_at,
      status_reason,
      cancel_at_period_end
    )
    values (
      p_user_id,
      p_plan_key,
      'active',
      plan_limit,
      0,
      p_started_at,
      effective_period_end,
      effective_period_end + interval '1 day',
      'hotmart',
      p_provider_customer_id,
      p_provider_subscription_id,
      p_product_id,
      p_offer_code,
      p_event_id,
      p_transaction_id,
      p_period_end,
      'payment_approved',
      false
    )
    returning * into updated_subscription;
  else
    update public.billing_subscriptions
    set
      plan_key = p_plan_key,
      status = 'active',
      activity_limit = plan_limit,
      generated_count = case
        when starts_new_cycle then 0
        else least(generated_count, plan_limit)
      end,
      current_period_start = case
        when starts_new_cycle then p_started_at
        else current_period_start
      end,
      current_period_end = case
        when starts_new_cycle then effective_period_end
        else greatest(current_period_end, coalesce(p_period_end, current_period_end))
      end,
      grace_ends_at = case
        when starts_new_cycle then effective_period_end + interval '1 day'
        else greatest(
          coalesce(grace_ends_at, current_period_end + interval '1 day'),
          coalesce(p_period_end + interval '1 day', current_period_end + interval '1 day')
        )
      end,
      suspended_at = null,
      inactive_delete_after = null,
      canceled_at = null,
      provider = 'hotmart',
      provider_customer_id = coalesce(p_provider_customer_id, provider_customer_id),
      provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id),
      provider_product_id = coalesce(p_product_id, provider_product_id),
      provider_offer_code = coalesce(p_offer_code, provider_offer_code),
      last_provider_event_id = coalesce(p_event_id, last_provider_event_id),
      last_payment_transaction_id = coalesce(p_transaction_id, last_payment_transaction_id),
      next_charge_at = coalesce(p_period_end, next_charge_at),
      status_reason = 'payment_approved',
      cancel_at_period_end = false,
      updated_at = now()
    where id = current_subscription.id
    returning * into updated_subscription;
  end if;

  update public.profiles
  set plan = p_plan_key
  where id = p_user_id;

  return updated_subscription;
end;
$pe_apply_hotmart_activation$;

create or replace function public.apply_hotmart_subscription_status(
  p_user_id uuid,
  p_provider_subscription_id text default null,
  p_status text default 'past_due',
  p_reason text default null,
  p_event_id text default null,
  p_effective_at timestamp with time zone default now(),
  p_cancel_at_period_end boolean default false
)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = public
as $pe_apply_hotmart_status$
declare
  current_subscription public.billing_subscriptions;
  updated_subscription public.billing_subscriptions;
begin
  if p_status not in ('active', 'past_due', 'suspended', 'canceled') then
    raise exception 'Status de assinatura inválido.';
  end if;

  select *
  into current_subscription
  from public.billing_subscriptions
  where user_id = p_user_id
  order by
    case
      when p_provider_subscription_id is not null
        and provider_subscription_id = p_provider_subscription_id then 0
      when status in ('active', 'past_due', 'suspended') then 1
      else 2
    end,
    created_at desc
  limit 1
  for update;

  if current_subscription.id is null then
    return null;
  end if;

  if p_cancel_at_period_end then
    update public.billing_subscriptions
    set
      status = case
        when current_period_end <= p_effective_at then 'canceled'
        else status
      end,
      canceled_at = coalesce(canceled_at, p_effective_at),
      inactive_delete_after = case
        when current_period_end <= p_effective_at
          then coalesce(inactive_delete_after, p_effective_at + interval '30 days')
        else inactive_delete_after
      end,
      cancel_at_period_end = true,
      status_reason = coalesce(p_reason, 'subscription_cancellation'),
      last_provider_event_id = coalesce(p_event_id, last_provider_event_id),
      updated_at = now()
    where id = current_subscription.id
    returning * into updated_subscription;
  else
    update public.billing_subscriptions
    set
      status = p_status,
      grace_ends_at = case
        when p_status = 'past_due'
          then coalesce(grace_ends_at, current_period_end + interval '1 day')
        else grace_ends_at
      end,
      suspended_at = case
        when p_status = 'suspended' then coalesce(suspended_at, p_effective_at)
        when p_status = 'active' then null
        else suspended_at
      end,
      inactive_delete_after = case
        when p_status in ('suspended', 'canceled')
          then coalesce(inactive_delete_after, p_effective_at + interval '30 days')
        when p_status = 'active' then null
        else inactive_delete_after
      end,
      canceled_at = case
        when p_status = 'canceled' then coalesce(canceled_at, p_effective_at)
        when p_status = 'active' then null
        else canceled_at
      end,
      status_reason = p_reason,
      last_provider_event_id = coalesce(p_event_id, last_provider_event_id),
      cancel_at_period_end = case when p_status = 'active' then false else cancel_at_period_end end,
      updated_at = now()
    where id = current_subscription.id
    returning * into updated_subscription;
  end if;

  return updated_subscription;
end;
$pe_apply_hotmart_status$;

create or replace function public.billing_maintenance()
returns table(suspended_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = public, auth
as $pe_hotmart_billing_maintenance$
declare
  suspended_total integer := 0;
  deleted_total integer := 0;
begin
  update public.billing_subscriptions
  set
    status = 'canceled',
    status_reason = coalesce(status_reason, 'canceled_at_period_end'),
    inactive_delete_after = coalesce(inactive_delete_after, current_period_end + interval '30 days'),
    updated_at = now()
  where status = 'active'
    and cancel_at_period_end = true
    and current_period_end < now();

  update public.billing_subscriptions
  set
    status = 'past_due',
    status_reason = coalesce(status_reason, 'payment_overdue'),
    grace_ends_at = coalesce(grace_ends_at, current_period_end + interval '1 day'),
    updated_at = now()
  where status = 'active'
    and cancel_at_period_end = false
    and current_period_end < now();

  update public.billing_subscriptions
  set
    status = 'suspended',
    status_reason = coalesce(status_reason, 'payment_overdue'),
    suspended_at = coalesce(suspended_at, now()),
    inactive_delete_after = coalesce(inactive_delete_after, now() + interval '30 days'),
    updated_at = now()
  where status = 'past_due'
    and coalesce(grace_ends_at, current_period_end + interval '1 day') < now();

  get diagnostics suspended_total = row_count;

  with users_to_delete as (
    select distinct user_id
    from public.billing_subscriptions
    where status in ('suspended', 'canceled')
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
$pe_hotmart_billing_maintenance$;

revoke all on table public.hotmart_events from public, anon, authenticated;
grant all on table public.hotmart_events to service_role;

revoke execute on function public.apply_hotmart_subscription_activation(uuid, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone)
from public, anon, authenticated;
revoke execute on function public.apply_hotmart_subscription_status(uuid, text, text, text, text, timestamp with time zone, boolean)
from public, anon, authenticated;

grant execute on function public.apply_hotmart_subscription_activation(uuid, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone)
to service_role;
grant execute on function public.apply_hotmart_subscription_status(uuid, text, text, text, text, timestamp with time zone, boolean)
to service_role;
