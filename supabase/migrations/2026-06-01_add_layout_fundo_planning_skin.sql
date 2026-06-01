alter table public.profiles
add column if not exists planning_pdf_skill text not null default 'grade';

update public.profiles
set planning_pdf_skill = 'grade'
where planning_pdf_skill is null
   or planning_pdf_skill not in ('grade', 'layout_fundo_1', 'layout_fundo_2', 'layout_fundo_3', 'layout_fundo_4', 'layout_fundo_5', 'layout_fundo_6', 'layout_fundo_7', 'layout_fundo_8', 'layout_fundo_9');

alter table public.profiles
drop constraint if exists profiles_planning_pdf_skill_check;

alter table public.profiles
add constraint profiles_planning_pdf_skill_check
check (planning_pdf_skill in ('grade', 'layout_fundo_1', 'layout_fundo_2', 'layout_fundo_3', 'layout_fundo_4', 'layout_fundo_5', 'layout_fundo_6', 'layout_fundo_7', 'layout_fundo_8', 'layout_fundo_9'));
