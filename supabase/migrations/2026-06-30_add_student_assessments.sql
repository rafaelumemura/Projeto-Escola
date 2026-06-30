create table if not exists public.assessment_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (length(trim(name)) > 0),
  check (length(trim(slug)) > 0)
);

create table if not exists public.student_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  description text,
  assessment_type text not null check (assessment_type in (
    'exam',
    'work',
    'evaluative_activity',
    'homework',
    'project',
    'participation',
    'reading',
    'other'
  )),
  assessment_date date not null default current_date,
  score numeric(8, 2),
  max_score numeric(8, 2),
  delivery_status text check (delivery_status in ('on_time', 'late', 'not_delivered', 'not_applicable')),
  participation_level text check (participation_level in ('excellent', 'good', 'regular', 'low', 'not_evaluated')),
  comments text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (score is null or score >= 0),
  check (max_score is null or max_score > 0)
);

create table if not exists public.student_assessment_criteria (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.student_assessments(id) on delete cascade,
  criterion_id uuid not null references public.assessment_criteria(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  unique (assessment_id, criterion_id)
);

create unique index if not exists assessment_criteria_global_slug_unique_idx
  on public.assessment_criteria(slug)
  where user_id is null;

create unique index if not exists assessment_criteria_user_slug_unique_idx
  on public.assessment_criteria(user_id, slug)
  where user_id is not null;

create index if not exists assessment_criteria_visible_idx
  on public.assessment_criteria(user_id, is_active, sort_order, name);

create index if not exists student_assessments_student_date_idx
  on public.student_assessments(user_id, student_id, assessment_date desc);

create index if not exists student_assessments_class_date_idx
  on public.student_assessments(user_id, class_id, assessment_date desc);

create index if not exists student_assessment_criteria_assessment_idx
  on public.student_assessment_criteria(assessment_id);

create index if not exists student_assessment_criteria_criterion_idx
  on public.student_assessment_criteria(criterion_id);

drop trigger if exists set_assessment_criteria_updated_at on public.assessment_criteria;
create trigger set_assessment_criteria_updated_at
before update on public.assessment_criteria
for each row execute function public.set_updated_at();

drop trigger if exists set_student_assessments_updated_at on public.student_assessments;
create trigger set_student_assessments_updated_at
before update on public.student_assessments
for each row execute function public.set_updated_at();

alter table public.assessment_criteria enable row level security;
alter table public.student_assessments enable row level security;
alter table public.student_assessment_criteria enable row level security;

drop policy if exists "assessment_criteria_select_visible" on public.assessment_criteria;
create policy "assessment_criteria_select_visible" on public.assessment_criteria
for select using (user_id is null or user_id = auth.uid());

drop policy if exists "assessment_criteria_insert_own" on public.assessment_criteria;
create policy "assessment_criteria_insert_own" on public.assessment_criteria
for insert with check (user_id = auth.uid());

drop policy if exists "assessment_criteria_update_own" on public.assessment_criteria;
create policy "assessment_criteria_update_own" on public.assessment_criteria
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "assessment_criteria_delete_own" on public.assessment_criteria;
create policy "assessment_criteria_delete_own" on public.assessment_criteria
for delete using (user_id = auth.uid());

drop policy if exists "student_assessments_select_own" on public.student_assessments;
create policy "student_assessments_select_own" on public.student_assessments
for select using (user_id = auth.uid());

drop policy if exists "student_assessments_insert_own" on public.student_assessments;
create policy "student_assessments_insert_own" on public.student_assessments
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.students s
    where s.id = student_id
      and s.user_id = auth.uid()
      and s.class_id = class_id
  )
);

drop policy if exists "student_assessments_update_own" on public.student_assessments;
create policy "student_assessments_update_own" on public.student_assessments
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.students s
    where s.id = student_id
      and s.user_id = auth.uid()
      and s.class_id = class_id
  )
);

drop policy if exists "student_assessments_delete_own" on public.student_assessments;
create policy "student_assessments_delete_own" on public.student_assessments
for delete using (user_id = auth.uid());

drop policy if exists "student_assessment_criteria_select_own" on public.student_assessment_criteria;
create policy "student_assessment_criteria_select_own" on public.student_assessment_criteria
for select using (
  exists (
    select 1 from public.student_assessments a
    where a.id = assessment_id and a.user_id = auth.uid()
  )
);

drop policy if exists "student_assessment_criteria_insert_own" on public.student_assessment_criteria;
create policy "student_assessment_criteria_insert_own" on public.student_assessment_criteria
for insert with check (
  exists (
    select 1 from public.student_assessments a
    where a.id = assessment_id and a.user_id = auth.uid()
  )
  and exists (
    select 1 from public.assessment_criteria c
    where c.id = criterion_id and (c.user_id is null or c.user_id = auth.uid())
  )
);

drop policy if exists "student_assessment_criteria_delete_own" on public.student_assessment_criteria;
create policy "student_assessment_criteria_delete_own" on public.student_assessment_criteria
for delete using (
  exists (
    select 1 from public.student_assessments a
    where a.id = assessment_id and a.user_id = auth.uid()
  )
);

insert into public.assessment_criteria (user_id, name, slug, sort_order)
values
  (null, 'Participação', 'participacao', 10),
  (null, 'Organização', 'organizacao', 20),
  (null, 'Autonomia', 'autonomia', 30),
  (null, 'Comunicação', 'comunicacao', 40),
  (null, 'Criatividade', 'criatividade', 50),
  (null, 'Coordenação motora', 'coordenacao-motora', 60),
  (null, 'Linguagem', 'linguagem', 70),
  (null, 'Matemática', 'matematica', 80),
  (null, 'Atenção', 'atencao', 90),
  (null, 'Socialização', 'socializacao', 100),
  (null, 'Raciocínio lógico', 'raciocinio-logico', 110),
  (null, 'Desenvolvimento emocional', 'desenvolvimento-emocional', 120)
on conflict do nothing;

grant select, insert, update, delete on public.assessment_criteria to authenticated;
grant select, insert, update, delete on public.student_assessments to authenticated;
grant select, insert, delete on public.student_assessment_criteria to authenticated;
