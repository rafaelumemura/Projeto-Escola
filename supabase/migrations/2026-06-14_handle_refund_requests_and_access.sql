-- Treat Hotmart refund requests as an immediate suspension and enforce access
-- at the database boundary as well as in the application.

create or replace function public.has_current_app_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $pe_has_current_app_access$
  select exists (
    select 1
    from public.billing_subscriptions subscription
    where subscription.user_id = auth.uid()
      and (
        (
          subscription.status = 'active'
          and now() <= case
            when subscription.cancel_at_period_end then subscription.current_period_end
            else coalesce(subscription.grace_ends_at, subscription.current_period_end + interval '1 day')
          end
        )
        or (
          subscription.status = 'past_due'
          and now() <= coalesce(subscription.grace_ends_at, subscription.current_period_end + interval '1 day')
        )
      )
  );
$pe_has_current_app_access$;

revoke execute on function public.has_current_app_access() from public, anon;
grant execute on function public.has_current_app_access() to authenticated, service_role;

create or replace function public.prevent_terminal_subscription_reactivation()
returns trigger
language plpgsql
set search_path = public
as $pe_prevent_terminal_reactivation$
begin
  if old.status = 'suspended'
    and old.status_reason in ('purchase_protest', 'purchase_refunded', 'purchase_chargeback')
    and new.status = 'active'
    and new.current_period_start <= coalesce(old.suspended_at, old.updated_at)
  then
    return old;
  end if;

  return new;
end;
$pe_prevent_terminal_reactivation$;

drop trigger if exists prevent_terminal_subscription_reactivation on public.billing_subscriptions;
create trigger prevent_terminal_subscription_reactivation
before update on public.billing_subscriptions
for each row execute function public.prevent_terminal_subscription_reactivation();

drop policy if exists "active_subscription_required" on public.activities;
create policy "active_subscription_required"
on public.activities
as restrictive
for all
to authenticated
using (public.has_current_app_access())
with check (public.has_current_app_access());

drop policy if exists "active_subscription_required" on public.collections;
create policy "active_subscription_required"
on public.collections
as restrictive
for all
to authenticated
using (public.has_current_app_access())
with check (public.has_current_app_access());

drop policy if exists "active_subscription_required" on public.collection_activities;
create policy "active_subscription_required"
on public.collection_activities
as restrictive
for all
to authenticated
using (public.has_current_app_access())
with check (public.has_current_app_access());

drop policy if exists "active_subscription_required" on public.weekly_plans;
create policy "active_subscription_required"
on public.weekly_plans
as restrictive
for all
to authenticated
using (public.has_current_app_access())
with check (public.has_current_app_access());

drop policy if exists "active_subscription_required" on public.weekly_plan_items;
create policy "active_subscription_required"
on public.weekly_plan_items
as restrictive
for all
to authenticated
using (public.has_current_app_access())
with check (public.has_current_app_access());

-- Resolve real refund requests that were previously stored as ignored events.
with resolved_protests as (
  select
    event.id as event_id,
    event.received_at,
    coalesce(
      event.user_id,
      (
        select subscription.user_id
        from public.billing_subscriptions subscription
        where subscription.provider = 'hotmart'
          and subscription.provider_subscription_id = event.subscription_id
        order by subscription.created_at desc
        limit 1
      ),
      (
        select profile.id
        from public.profiles profile
        where lower(profile.email) = lower(event.buyer_email)
        limit 1
      )
    ) as user_id
  from public.hotmart_events event
  where event.event_type = 'PURCHASE_PROTEST'
    and coalesce(event.product_id, '') <> '0'
),
effective_protests as (
  select
    protest.user_id,
    min(protest.received_at) as protested_at
  from resolved_protests protest
  where protest.user_id is not null
    and not exists (
      select 1
      from public.hotmart_events activation
      where activation.user_id = protest.user_id
        and activation.status = 'processed'
        and activation.event_type in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE')
        and activation.received_at > protest.received_at
    )
  group by protest.user_id
),
target_subscriptions as (
  select distinct on (subscription.user_id)
    subscription.id,
    subscription.user_id,
    protest.protested_at
  from public.billing_subscriptions subscription
  join effective_protests protest on protest.user_id = subscription.user_id
  order by subscription.user_id, subscription.created_at desc
)
update public.billing_subscriptions subscription
set
  status = 'suspended',
  status_reason = 'purchase_protest',
  suspended_at = least(
    coalesce(subscription.suspended_at, target.protested_at),
    target.protested_at
  ),
  canceled_at = least(
    coalesce(subscription.canceled_at, target.protested_at),
    target.protested_at
  ),
  inactive_delete_after = target.protested_at + interval '30 days',
  cancel_at_period_end = false,
  updated_at = now()
from target_subscriptions target
where subscription.id = target.id;

with resolved_protests as (
  select
    event.id,
    coalesce(
      event.user_id,
      (
        select subscription.user_id
        from public.billing_subscriptions subscription
        where subscription.provider = 'hotmart'
          and subscription.provider_subscription_id = event.subscription_id
        order by subscription.created_at desc
        limit 1
      ),
      (
        select profile.id
        from public.profiles profile
        where lower(profile.email) = lower(event.buyer_email)
        limit 1
      )
    ) as user_id
  from public.hotmart_events event
  where event.event_type = 'PURCHASE_PROTEST'
    and coalesce(event.product_id, '') <> '0'
)
update public.hotmart_events event
set
  status = case when protest.user_id is null then event.status else 'processed' end,
  user_id = coalesce(protest.user_id, event.user_id),
  result = case
    when protest.user_id is null then event.result
    else jsonb_build_object(
      'action', 'suspended',
      'reason', 'purchase_protest',
      'user_id', protest.user_id
    )
  end,
  last_error = null,
  processed_at = case
    when protest.user_id is null then event.processed_at
    else coalesce(event.processed_at, now())
  end,
  updated_at = now()
from resolved_protests protest
where event.id = protest.id;
