create table if not exists public.lesson_metric_definitions (
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

create table if not exists public.lesson_metric_options (
  id uuid primary key default gen_random_uuid(),
  metric_definition_id uuid not null references public.lesson_metric_definitions(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (metric_definition_id, value),
  check (length(trim(label)) > 0),
  check (length(trim(value)) > 0)
);

create table if not exists public.lesson_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_plan_item_id uuid references public.weekly_plan_items(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  lesson_date date not null,
  activity_title text not null,
  development_area text,
  methodology text,
  source text not null default 'planning' check (source in ('planning')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (weekly_plan_item_id)
);

create table if not exists public.lesson_record_students (
  id uuid primary key default gen_random_uuid(),
  lesson_record_id uuid not null references public.lesson_records(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  observation text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (lesson_record_id, student_id)
);

create table if not exists public.lesson_record_metrics (
  id uuid primary key default gen_random_uuid(),
  lesson_record_student_id uuid not null references public.lesson_record_students(id) on delete cascade,
  metric_definition_id uuid not null references public.lesson_metric_definitions(id) on delete restrict,
  metric_option_id uuid not null references public.lesson_metric_options(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  unique (lesson_record_student_id, metric_definition_id)
);

create unique index if not exists lesson_metric_definitions_global_slug_unique_idx
  on public.lesson_metric_definitions(slug) where user_id is null;
create unique index if not exists lesson_metric_definitions_user_slug_unique_idx
  on public.lesson_metric_definitions(user_id, slug) where user_id is not null;
create index if not exists lesson_metric_definitions_visible_idx
  on public.lesson_metric_definitions(user_id, is_active, sort_order);
create index if not exists lesson_metric_options_definition_idx
  on public.lesson_metric_options(metric_definition_id, sort_order);
create index if not exists lesson_records_user_class_date_idx
  on public.lesson_records(user_id, class_id, lesson_date desc);
create index if not exists lesson_record_students_student_idx
  on public.lesson_record_students(student_id, lesson_record_id);
create index if not exists lesson_record_metrics_student_idx
  on public.lesson_record_metrics(lesson_record_student_id);

drop trigger if exists set_lesson_metric_definitions_updated_at on public.lesson_metric_definitions;
create trigger set_lesson_metric_definitions_updated_at
before update on public.lesson_metric_definitions
for each row execute function public.set_updated_at();

drop trigger if exists set_lesson_metric_options_updated_at on public.lesson_metric_options;
create trigger set_lesson_metric_options_updated_at
before update on public.lesson_metric_options
for each row execute function public.set_updated_at();

drop trigger if exists set_lesson_records_updated_at on public.lesson_records;
create trigger set_lesson_records_updated_at
before update on public.lesson_records
for each row execute function public.set_updated_at();

drop trigger if exists set_lesson_record_students_updated_at on public.lesson_record_students;
create trigger set_lesson_record_students_updated_at
before update on public.lesson_record_students
for each row execute function public.set_updated_at();

alter table public.lesson_metric_definitions enable row level security;
alter table public.lesson_metric_options enable row level security;
alter table public.lesson_records enable row level security;
alter table public.lesson_record_students enable row level security;
alter table public.lesson_record_metrics enable row level security;

drop policy if exists "lesson_metric_definitions_select_visible" on public.lesson_metric_definitions;
create policy "lesson_metric_definitions_select_visible" on public.lesson_metric_definitions
for select using (user_id is null or user_id = auth.uid());
drop policy if exists "lesson_metric_definitions_insert_own" on public.lesson_metric_definitions;
create policy "lesson_metric_definitions_insert_own" on public.lesson_metric_definitions
for insert with check (user_id = auth.uid());
drop policy if exists "lesson_metric_definitions_update_own" on public.lesson_metric_definitions;
create policy "lesson_metric_definitions_update_own" on public.lesson_metric_definitions
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "lesson_metric_definitions_delete_own" on public.lesson_metric_definitions;
create policy "lesson_metric_definitions_delete_own" on public.lesson_metric_definitions
for delete using (user_id = auth.uid());

drop policy if exists "lesson_metric_options_select_visible" on public.lesson_metric_options;
create policy "lesson_metric_options_select_visible" on public.lesson_metric_options
for select using (
  exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and (d.user_id is null or d.user_id = auth.uid())
  )
);
drop policy if exists "lesson_metric_options_insert_own" on public.lesson_metric_options;
create policy "lesson_metric_options_insert_own" on public.lesson_metric_options
for insert with check (
  exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and d.user_id = auth.uid()
  )
);
drop policy if exists "lesson_metric_options_update_own" on public.lesson_metric_options;
create policy "lesson_metric_options_update_own" on public.lesson_metric_options
for update using (
  exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and d.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and d.user_id = auth.uid()
  )
);
drop policy if exists "lesson_metric_options_delete_own" on public.lesson_metric_options;
create policy "lesson_metric_options_delete_own" on public.lesson_metric_options
for delete using (
  exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and d.user_id = auth.uid()
  )
);

drop policy if exists "lesson_records_select_own" on public.lesson_records;
create policy "lesson_records_select_own" on public.lesson_records
for select using (user_id = auth.uid());
drop policy if exists "lesson_records_insert_own" on public.lesson_records;
create policy "lesson_records_insert_own" on public.lesson_records
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.classes c where c.id = class_id and c.user_id = auth.uid())
  and (
    weekly_plan_item_id is null
    or exists (
      select 1
      from public.weekly_plan_items i
      join public.weekly_plans p on p.id = i.weekly_plan_id
      where i.id = weekly_plan_item_id and p.user_id = auth.uid() and p.class_id = lesson_records.class_id
    )
  )
  and (activity_id is null or exists (select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid()))
);
drop policy if exists "lesson_records_update_own" on public.lesson_records;
create policy "lesson_records_update_own" on public.lesson_records
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (select 1 from public.classes c where c.id = class_id and c.user_id = auth.uid())
  and (
    weekly_plan_item_id is null
    or exists (
      select 1
      from public.weekly_plan_items i
      join public.weekly_plans p on p.id = i.weekly_plan_id
      where i.id = weekly_plan_item_id and p.user_id = auth.uid() and p.class_id = lesson_records.class_id
    )
  )
  and (activity_id is null or exists (select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid()))
);
drop policy if exists "lesson_records_delete_own" on public.lesson_records;
create policy "lesson_records_delete_own" on public.lesson_records
for delete using (user_id = auth.uid());

drop policy if exists "lesson_record_students_select_own" on public.lesson_record_students;
create policy "lesson_record_students_select_own" on public.lesson_record_students
for select using (
  exists (select 1 from public.lesson_records r where r.id = lesson_record_id and r.user_id = auth.uid())
);
drop policy if exists "lesson_record_students_insert_own" on public.lesson_record_students;
create policy "lesson_record_students_insert_own" on public.lesson_record_students
for insert with check (
  exists (
    select 1
    from public.lesson_records r
    join public.students s on s.id = student_id
    where r.id = lesson_record_id
      and r.user_id = auth.uid()
      and s.user_id = auth.uid()
      and s.class_id = r.class_id
  )
);
drop policy if exists "lesson_record_students_update_own" on public.lesson_record_students;
create policy "lesson_record_students_update_own" on public.lesson_record_students
for update using (
  exists (select 1 from public.lesson_records r where r.id = lesson_record_id and r.user_id = auth.uid())
) with check (
  exists (
    select 1
    from public.lesson_records r
    join public.students s on s.id = student_id
    where r.id = lesson_record_id
      and r.user_id = auth.uid()
      and s.user_id = auth.uid()
      and s.class_id = r.class_id
  )
);
drop policy if exists "lesson_record_students_delete_own" on public.lesson_record_students;
create policy "lesson_record_students_delete_own" on public.lesson_record_students
for delete using (
  exists (select 1 from public.lesson_records r where r.id = lesson_record_id and r.user_id = auth.uid())
);

drop policy if exists "lesson_record_metrics_select_own" on public.lesson_record_metrics;
create policy "lesson_record_metrics_select_own" on public.lesson_record_metrics
for select using (
  exists (
    select 1
    from public.lesson_record_students rs
    join public.lesson_records r on r.id = rs.lesson_record_id
    where rs.id = lesson_record_student_id and r.user_id = auth.uid()
  )
);
drop policy if exists "lesson_record_metrics_insert_own" on public.lesson_record_metrics;
create policy "lesson_record_metrics_insert_own" on public.lesson_record_metrics
for insert with check (
  exists (
    select 1
    from public.lesson_record_students rs
    join public.lesson_records r on r.id = rs.lesson_record_id
    where rs.id = lesson_record_student_id and r.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.lesson_metric_options o
    join public.lesson_metric_definitions d on d.id = o.metric_definition_id
    where o.id = metric_option_id
      and d.id = metric_definition_id
      and d.is_active = true
      and (d.user_id is null or d.user_id = auth.uid())
  )
);
drop policy if exists "lesson_record_metrics_delete_own" on public.lesson_record_metrics;
create policy "lesson_record_metrics_delete_own" on public.lesson_record_metrics
for delete using (
  exists (
    select 1
    from public.lesson_record_students rs
    join public.lesson_records r on r.id = rs.lesson_record_id
    where rs.id = lesson_record_student_id and r.user_id = auth.uid()
  )
);

insert into public.lesson_metric_definitions (user_id, name, slug, sort_order)
values
  (null, 'Participação', 'participacao', 10),
  (null, 'Autonomia', 'autonomia', 20),
  (null, 'Conclusão da atividade', 'conclusao', 30)
on conflict do nothing;

insert into public.lesson_metric_options (metric_definition_id, label, value, sort_order)
select d.id, option_data.label, option_data.value, option_data.sort_order
from public.lesson_metric_definitions d
join (values
  ('participacao', 'Excelente', 'excellent', 10),
  ('participacao', 'Boa', 'good', 20),
  ('participacao', 'Regular', 'regular', 30),
  ('participacao', 'Baixa', 'low', 40),
  ('autonomia', 'Independente', 'independent', 10),
  ('autonomia', 'Pequena ajuda', 'small_help', 20),
  ('autonomia', 'Muita ajuda', 'much_help', 30),
  ('conclusao', 'Concluiu', 'completed', 10),
  ('conclusao', 'Parcial', 'partial', 20),
  ('conclusao', 'Não concluiu', 'not_completed', 30)
) as option_data(metric_slug, label, value, sort_order)
  on option_data.metric_slug = d.slug
where d.user_id is null
on conflict (metric_definition_id, value) do nothing;

create or replace function public.save_lesson_record(
  p_weekly_plan_item_id uuid,
  p_students jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_class_id uuid;
  v_activity_id uuid;
  v_lesson_date date;
  v_activity_title text;
  v_development_area text;
  v_methodology text;
  v_record_id uuid;
  v_record_student_id uuid;
  v_student jsonb;
  v_metric jsonb;
  v_student_id uuid;
  v_metric_id uuid;
  v_option_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if jsonb_typeof(p_students) <> 'array' or jsonb_array_length(p_students) = 0 then
    raise exception 'A turma não possui alunos para registrar.';
  end if;

  select p.class_id, i.activity_id, i.date, coalesce(a.title, 'Atividade removida'), a.development_area, a.methodology
    into v_class_id, v_activity_id, v_lesson_date, v_activity_title, v_development_area, v_methodology
  from public.weekly_plan_items i
  join public.weekly_plans p on p.id = i.weekly_plan_id
  left join public.activities a on a.id = i.activity_id
  where i.id = p_weekly_plan_item_id
    and p.user_id = v_user_id;

  if not found then
    raise exception 'Atividade planejada não encontrada.';
  end if;

  if v_class_id is null then
    raise exception 'Selecione uma turma no planejamento antes de registrar a aula.';
  end if;

  insert into public.lesson_records (
    user_id,
    weekly_plan_item_id,
    class_id,
    activity_id,
    lesson_date,
    activity_title,
    development_area,
    methodology,
    source
  ) values (
    v_user_id,
    p_weekly_plan_item_id,
    v_class_id,
    v_activity_id,
    v_lesson_date,
    v_activity_title,
    v_development_area,
    v_methodology,
    'planning'
  )
  on conflict (weekly_plan_item_id) do update set
    class_id = excluded.class_id,
    activity_id = excluded.activity_id,
    lesson_date = excluded.lesson_date,
    activity_title = excluded.activity_title,
    development_area = excluded.development_area,
    methodology = excluded.methodology,
    updated_at = now()
  returning id into v_record_id;

  delete from public.lesson_record_students where lesson_record_id = v_record_id;

  for v_student in select value from jsonb_array_elements(p_students)
  loop
    v_student_id := (v_student->>'student_id')::uuid;

    if not exists (
      select 1 from public.students s
      where s.id = v_student_id
        and s.user_id = v_user_id
        and s.class_id = v_class_id
        and s.status = 'active'
    ) then
      raise exception 'Aluno inválido para esta turma.';
    end if;

    insert into public.lesson_record_students (lesson_record_id, student_id, observation)
    values (v_record_id, v_student_id, nullif(trim(v_student->>'observation'), ''))
    returning id into v_record_student_id;

    for v_metric in select value from jsonb_array_elements(coalesce(v_student->'metrics', '[]'::jsonb))
    loop
      v_metric_id := (v_metric->>'metric_id')::uuid;
      v_option_id := (v_metric->>'option_id')::uuid;

      if not exists (
        select 1
        from public.lesson_metric_options o
        join public.lesson_metric_definitions d on d.id = o.metric_definition_id
        where o.id = v_option_id
          and d.id = v_metric_id
          and d.is_active = true
          and (d.user_id is null or d.user_id = v_user_id)
      ) then
        raise exception 'Indicador inválido.';
      end if;

      insert into public.lesson_record_metrics (
        lesson_record_student_id,
        metric_definition_id,
        metric_option_id
      ) values (
        v_record_student_id,
        v_metric_id,
        v_option_id
      );
    end loop;
  end loop;

  return v_record_id;
end;
$$;

grant select, insert, update, delete on public.lesson_metric_definitions to authenticated;
grant select, insert, update, delete on public.lesson_metric_options to authenticated;
grant select, insert, update, delete on public.lesson_records to authenticated;
grant select, insert, update, delete on public.lesson_record_students to authenticated;
grant select, insert, delete on public.lesson_record_metrics to authenticated;
grant execute on function public.save_lesson_record(uuid, jsonb) to authenticated;
