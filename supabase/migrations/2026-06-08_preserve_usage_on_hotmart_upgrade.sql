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
    or coalesce(current_subscription.provider, '') <> 'hotmart';

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

with switched_subscriptions as (
  select
    subscription.id,
    subscription.user_id,
    subscription.activity_limit,
    subscription.current_period_end,
    cycle_start.received_at as preserved_cycle_start
  from public.billing_subscriptions subscription
  join public.profiles profile on profile.id = subscription.user_id
  join lateral (
    select event.received_at
    from public.hotmart_events event
    where event.subscription_id = subscription.provider_subscription_id
      and lower(event.buyer_email) = lower(profile.email)
      and event.event_type = 'SWITCH_PLAN'
      and event.status = 'processed'
      and event.received_at >= subscription.current_period_start - interval '10 minutes'
      and event.received_at <= subscription.current_period_end
    order by event.received_at desc
    limit 1
  ) switch_event on true
  join lateral (
    select event.received_at
    from public.hotmart_events event
    where event.subscription_id = subscription.provider_subscription_id
      and lower(event.buyer_email) = lower(profile.email)
      and event.event_type in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE')
      and event.status = 'processed'
      and event.received_at <= switch_event.received_at
    order by event.received_at desc
    limit 1
  ) cycle_start on true
  where subscription.provider = 'hotmart'
    and subscription.status in ('active', 'past_due')
),
generated_counts as (
  select
    subscription.id,
    count(activity.id)::integer as generated_count
  from switched_subscriptions subscription
  left join public.activities activity
    on activity.user_id = subscription.user_id
    and activity.created_at >= subscription.preserved_cycle_start
    and activity.created_at <= subscription.current_period_end
    and coalesce(activity.raw_ai_response->>'manual', 'false') <> 'true'
  group by subscription.id
)
update public.billing_subscriptions subscription
set
  generated_count = least(
    subscription.activity_limit,
    greatest(subscription.generated_count, generated_counts.generated_count)
  ),
  updated_at = now()
from generated_counts
where subscription.id = generated_counts.id
  and subscription.generated_count < least(subscription.activity_limit, generated_counts.generated_count);
