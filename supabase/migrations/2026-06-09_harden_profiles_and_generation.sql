-- Prevent authenticated clients from changing billing or access fields directly.
revoke insert, update, delete on table public.profiles from public, anon, authenticated;
grant update (name, avatar_url, planning_pdf_skill, theme_preference)
on table public.profiles
to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create or replace function public.reserve_activity_generation(p_user_id uuid)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = public
as $pe_reserve_activity_generation$
declare
  current_subscription public.billing_subscriptions;
begin
  select *
  into current_subscription
  from public.billing_subscriptions
  where user_id = p_user_id
    and status in ('active', 'past_due', 'suspended')
  order by created_at desc
  limit 1
  for update;

  if current_subscription.id is null then
    raise exception 'Nenhum plano ativo foi encontrado.';
  end if;

  if current_subscription.status <> 'active' then
    raise exception 'O plano não está ativo.';
  end if;

  if current_subscription.current_period_end < now() then
    raise exception 'O ciclo atual do plano venceu.';
  end if;

  if current_subscription.generated_count >= current_subscription.activity_limit then
    raise exception 'Você usou todas as gerações disponíveis neste ciclo.';
  end if;

  update public.billing_subscriptions
  set
    generated_count = generated_count + 1,
    updated_at = now()
  where id = current_subscription.id
  returning * into current_subscription;

  return current_subscription;
end;
$pe_reserve_activity_generation$;

create or replace function public.release_activity_generation(
  p_user_id uuid,
  p_subscription_id uuid
)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = public
as $pe_release_activity_generation$
declare
  current_subscription public.billing_subscriptions;
begin
  select *
  into current_subscription
  from public.billing_subscriptions
  where id = p_subscription_id
    and user_id = p_user_id
  for update;

  if current_subscription.id is null then
    return null;
  end if;

  update public.billing_subscriptions
  set
    generated_count = greatest(0, generated_count - 1),
    updated_at = now()
  where id = current_subscription.id
  returning * into current_subscription;

  return current_subscription;
end;
$pe_release_activity_generation$;

revoke execute on function public.reserve_activity_generation(uuid) from public, anon, authenticated;
revoke execute on function public.release_activity_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_activity_generation(uuid) to service_role;
grant execute on function public.release_activity_generation(uuid, uuid) to service_role;
