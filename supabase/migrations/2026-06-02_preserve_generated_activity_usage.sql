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
as $pe_preserve_generated_usage$
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
      generated_count = case
        when active_subscription.current_period_end <= p_started_at then 0
        else least(generated_count, plan_limit)
      end,
      current_period_start = case
        when active_subscription.current_period_end <= p_started_at then p_started_at
        else current_period_start
      end,
      current_period_end = case
        when active_subscription.current_period_end <= p_started_at then p_started_at + make_interval(days => period_days)
        else current_period_end
      end,
      grace_ends_at = case
        when active_subscription.current_period_end <= p_started_at then p_started_at + make_interval(days => period_days + 1)
        else grace_ends_at
      end,
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
$pe_preserve_generated_usage$;

update public.billing_subscriptions subscription
set generated_count = greatest(
      subscription.generated_count,
      least(
        subscription.activity_limit,
        coalesce(
          (
            select count(*)::integer
            from public.activities activity
            where activity.user_id = subscription.user_id
              and activity.created_at >= subscription.current_period_start
              and activity.created_at <= subscription.current_period_end
              and coalesce(activity.raw_ai_response->>'manual', 'false') <> 'true'
          ),
          0
        )
      )
    ),
    updated_at = now()
where subscription.status in ('active', 'past_due')
  and subscription.current_period_start is not null
  and subscription.current_period_end is not null;
