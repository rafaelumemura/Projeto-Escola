alter table public.profiles
add column if not exists ui_font_family text not null default 'inter';

alter table public.profiles
add column if not exists ui_font_scale text not null default 'default';

alter table public.profiles
drop constraint if exists profiles_ui_font_family_check;

alter table public.profiles
add constraint profiles_ui_font_family_check
check (ui_font_family in ('inter', 'nunito', 'atkinson', 'open_sans', 'poppins'));

alter table public.profiles
drop constraint if exists profiles_ui_font_scale_check;

alter table public.profiles
add constraint profiles_ui_font_scale_check
check (ui_font_scale in ('small', 'default', 'large', 'extra_large'));

grant update (ui_font_family, ui_font_scale)
on table public.profiles
to authenticated;
