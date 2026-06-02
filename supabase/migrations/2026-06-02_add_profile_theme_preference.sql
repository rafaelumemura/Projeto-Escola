alter table public.profiles
  add column if not exists theme_preference text not null default 'light';

do $$
begin
  alter table public.profiles
    add constraint profiles_theme_preference_check
    check (theme_preference in ('light', 'dark'));
exception
  when duplicate_object then null;
end $$;
