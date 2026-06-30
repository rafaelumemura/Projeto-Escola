alter table public.profiles
add column if not exists theme_accent text not null default 'teal';

alter table public.profiles
drop constraint if exists profiles_theme_accent_check;

alter table public.profiles
add constraint profiles_theme_accent_check
check (theme_accent in ('teal', 'blue', 'coral', 'amber', 'purple', 'green'));

grant update (theme_accent)
on table public.profiles
to authenticated;
