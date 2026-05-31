update public.billing_subscriptions subscription
set generated_count = least(
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
    ),
    updated_at = now()
where subscription.status in ('active', 'past_due')
  and subscription.current_period_start is not null
  and subscription.current_period_end is not null;
