alter table public.profiles
add column if not exists password_must_change boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $pe_handle_new_user$
begin
  insert into public.profiles (id, name, email, is_admin, password_must_change)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    lower(coalesce(new.email, '')) = 'rafaelumemura@gmail.com',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$pe_handle_new_user$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
