alter table public.profiles
add column if not exists planning_pdf_skill text not null default 'grade';

alter table public.profiles
drop constraint if exists profiles_planning_pdf_skill_check;

alter table public.profiles
add constraint profiles_planning_pdf_skill_check
check (planning_pdf_skill in ('layout_fundo_1', 'grade', 'roteiro', 'lista'));
