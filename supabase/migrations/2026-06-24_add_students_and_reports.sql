create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  shift text,
  school_year text,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  birth_date date,
  general_notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.student_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  observation_type text not null check (observation_type in ('individual', 'activity', 'class', 'weekly', 'biweekly', 'free')),
  activity_id uuid references public.activities(id) on delete set null,
  date date not null default current_date,
  period_start date,
  period_end date,
  title text,
  content text not null,
  applies_to text not null default 'all_class' check (applies_to in ('all_class', 'selected_students', 'individual_student', 'none')),
  tags text[] not null default '{}',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.observation_students (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.student_observations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (observation_id, student_id)
);

create table if not exists public.student_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  report_type text not null,
  period_start date not null,
  period_end date not null,
  tone text not null,
  content text not null,
  structured_content jsonb,
  notes_hash text not null,
  generated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.report_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.student_reports(id) on delete set null,
  model text,
  report_type text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  created_at timestamp with time zone not null default now()
);

create index if not exists classes_user_idx on public.classes(user_id, created_at desc);
create index if not exists students_user_class_idx on public.students(user_id, class_id, status, name);
create index if not exists student_observations_user_class_date_idx on public.student_observations(user_id, class_id, date desc);
create index if not exists observation_students_observation_idx on public.observation_students(observation_id);
create index if not exists observation_students_student_idx on public.observation_students(student_id);
create index if not exists student_reports_user_class_student_idx on public.student_reports(user_id, class_id, student_id, generated_at desc);
create index if not exists student_reports_hash_idx on public.student_reports(user_id, notes_hash);
create unique index if not exists student_reports_cache_unique_idx
  on public.student_reports(user_id, class_id, coalesce(student_id, '00000000-0000-0000-0000-000000000000'::uuid), report_type, period_start, period_end, tone, notes_hash);

drop trigger if exists set_classes_updated_at on public.classes;
create trigger set_classes_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

drop trigger if exists set_students_updated_at on public.students;
create trigger set_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists set_student_observations_updated_at on public.student_observations;
create trigger set_student_observations_updated_at
before update on public.student_observations
for each row execute function public.set_updated_at();

drop trigger if exists set_student_reports_updated_at on public.student_reports;
create trigger set_student_reports_updated_at
before update on public.student_reports
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_observations enable row level security;
alter table public.observation_students enable row level security;
alter table public.student_reports enable row level security;
alter table public.report_generation_logs enable row level security;

drop policy if exists "classes_select_own" on public.classes;
create policy "classes_select_own" on public.classes
for select using (auth.uid() = user_id);

drop policy if exists "classes_insert_own" on public.classes;
create policy "classes_insert_own" on public.classes
for insert with check (auth.uid() = user_id);

drop policy if exists "classes_update_own" on public.classes;
create policy "classes_update_own" on public.classes
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "classes_delete_own" on public.classes;
create policy "classes_delete_own" on public.classes
for delete using (auth.uid() = user_id);

drop policy if exists "students_select_own" on public.students;
create policy "students_select_own" on public.students
for select using (auth.uid() = user_id);

drop policy if exists "students_insert_own" on public.students;
create policy "students_insert_own" on public.students
for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  )
);

drop policy if exists "students_update_own" on public.students;
create policy "students_update_own" on public.students
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  )
);

drop policy if exists "students_delete_own" on public.students;
create policy "students_delete_own" on public.students
for delete using (auth.uid() = user_id);

drop policy if exists "student_observations_select_own" on public.student_observations;
create policy "student_observations_select_own" on public.student_observations
for select using (auth.uid() = user_id);

drop policy if exists "student_observations_insert_own" on public.student_observations;
create policy "student_observations_insert_own" on public.student_observations
for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  )
);

drop policy if exists "student_observations_update_own" on public.student_observations;
create policy "student_observations_update_own" on public.student_observations
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  )
);

drop policy if exists "student_observations_delete_own" on public.student_observations;
create policy "student_observations_delete_own" on public.student_observations
for delete using (auth.uid() = user_id);

drop policy if exists "observation_students_select_own" on public.observation_students;
create policy "observation_students_select_own" on public.observation_students
for select using (
  exists (
    select 1 from public.student_observations o
    where o.id = observation_id and o.user_id = auth.uid()
  )
);

drop policy if exists "observation_students_insert_own" on public.observation_students;
create policy "observation_students_insert_own" on public.observation_students
for insert with check (
  exists (
    select 1
    from public.student_observations o
    join public.students s on s.id = student_id
    where o.id = observation_id
      and o.user_id = auth.uid()
      and s.user_id = auth.uid()
      and s.class_id = o.class_id
  )
);

drop policy if exists "observation_students_delete_own" on public.observation_students;
create policy "observation_students_delete_own" on public.observation_students
for delete using (
  exists (
    select 1 from public.student_observations o
    where o.id = observation_id and o.user_id = auth.uid()
  )
);

drop policy if exists "student_reports_select_own" on public.student_reports;
create policy "student_reports_select_own" on public.student_reports
for select using (auth.uid() = user_id);

drop policy if exists "student_reports_insert_own" on public.student_reports;
create policy "student_reports_insert_own" on public.student_reports
for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  ) and (
    student_id is null or exists (
      select 1 from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
        and s.class_id = class_id
    )
  )
);

drop policy if exists "student_reports_update_own" on public.student_reports;
create policy "student_reports_update_own" on public.student_reports
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.classes c
    where c.id = class_id and c.user_id = auth.uid()
  ) and (
    student_id is null or exists (
      select 1 from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
        and s.class_id = class_id
    )
  )
);

drop policy if exists "student_reports_delete_own" on public.student_reports;
create policy "student_reports_delete_own" on public.student_reports
for delete using (auth.uid() = user_id);

drop policy if exists "report_generation_logs_select_admin" on public.report_generation_logs;
create policy "report_generation_logs_select_admin" on public.report_generation_logs
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

drop policy if exists "report_generation_logs_insert_own" on public.report_generation_logs;
create policy "report_generation_logs_insert_own" on public.report_generation_logs
for insert with check (auth.uid() = user_id);
