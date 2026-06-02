create or replace function public.sync_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
  normalized_email text;
begin
  select email into auth_email
  from auth.users
  where id = new.id;

  new.email := coalesce(auth_email, new.email);
  normalized_email := lower(coalesce(new.email, ''));

  if normalized_email = 'rafaelumemura@gmail.com' then
    if tg_op = 'INSERT' then
      new.is_admin := true;
    else
      new.is_admin := coalesce(new.is_admin, false);
    end if;
  else
    new.is_admin := false;
  end if;

  return new;
end;
$$;
