alter table public.lesson_records
drop constraint if exists lesson_records_source_check;

alter table public.lesson_records
add constraint lesson_records_source_check
check (source in ('planning', 'class'));

alter table public.lesson_metric_options
add column if not exists performance_level smallint not null default 3
check (performance_level between 1 and 5);

alter table public.lesson_metric_options
add column if not exists color text not null default '#F2C94C';

create table if not exists public.lesson_metric_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  match_terms text[] not null default '{}',
  is_default boolean not null default false,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (length(trim(name)) > 0),
  check (length(trim(slug)) > 0)
);

create table if not exists public.lesson_metric_preset_items (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.lesson_metric_presets(id) on delete cascade,
  metric_definition_id uuid not null references public.lesson_metric_definitions(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  unique (preset_id, metric_definition_id)
);

create unique index if not exists lesson_metric_presets_global_slug_unique_idx
  on public.lesson_metric_presets(slug) where user_id is null;
create unique index if not exists lesson_metric_presets_user_slug_unique_idx
  on public.lesson_metric_presets(user_id, slug) where user_id is not null;
create index if not exists lesson_metric_presets_visible_idx
  on public.lesson_metric_presets(user_id, is_active, priority desc);
create index if not exists lesson_metric_preset_items_preset_idx
  on public.lesson_metric_preset_items(preset_id, sort_order);
create unique index if not exists lesson_records_class_activity_date_unique_idx
  on public.lesson_records(user_id, class_id, activity_id, lesson_date)
  where source = 'class' and activity_id is not null;

drop trigger if exists set_lesson_metric_presets_updated_at on public.lesson_metric_presets;
create trigger set_lesson_metric_presets_updated_at
before update on public.lesson_metric_presets
for each row execute function public.set_updated_at();

alter table public.lesson_metric_presets enable row level security;
alter table public.lesson_metric_preset_items enable row level security;

drop policy if exists "lesson_metric_presets_select_visible" on public.lesson_metric_presets;
create policy "lesson_metric_presets_select_visible" on public.lesson_metric_presets
for select using (user_id is null or user_id = auth.uid());
drop policy if exists "lesson_metric_presets_insert_own" on public.lesson_metric_presets;
create policy "lesson_metric_presets_insert_own" on public.lesson_metric_presets
for insert with check (user_id = auth.uid());
drop policy if exists "lesson_metric_presets_update_own" on public.lesson_metric_presets;
create policy "lesson_metric_presets_update_own" on public.lesson_metric_presets
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "lesson_metric_presets_delete_own" on public.lesson_metric_presets;
create policy "lesson_metric_presets_delete_own" on public.lesson_metric_presets
for delete using (user_id = auth.uid());

drop policy if exists "lesson_metric_preset_items_select_visible" on public.lesson_metric_preset_items;
create policy "lesson_metric_preset_items_select_visible" on public.lesson_metric_preset_items
for select using (
  exists (
    select 1 from public.lesson_metric_presets p
    where p.id = preset_id and (p.user_id is null or p.user_id = auth.uid())
  )
);
drop policy if exists "lesson_metric_preset_items_insert_own" on public.lesson_metric_preset_items;
create policy "lesson_metric_preset_items_insert_own" on public.lesson_metric_preset_items
for insert with check (
  exists (select 1 from public.lesson_metric_presets p where p.id = preset_id and p.user_id = auth.uid())
  and exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and (d.user_id is null or d.user_id = auth.uid())
  )
);
drop policy if exists "lesson_metric_preset_items_delete_own" on public.lesson_metric_preset_items;
create policy "lesson_metric_preset_items_delete_own" on public.lesson_metric_preset_items
for delete using (
  exists (select 1 from public.lesson_metric_presets p where p.id = preset_id and p.user_id = auth.uid())
);
drop policy if exists "lesson_metric_preset_items_update_own" on public.lesson_metric_preset_items;
create policy "lesson_metric_preset_items_update_own" on public.lesson_metric_preset_items
for update using (
  exists (select 1 from public.lesson_metric_presets p where p.id = preset_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.lesson_metric_presets p where p.id = preset_id and p.user_id = auth.uid())
  and exists (
    select 1 from public.lesson_metric_definitions d
    where d.id = metric_definition_id and (d.user_id is null or d.user_id = auth.uid())
  )
);

insert into public.lesson_metric_definitions (user_id, name, slug, sort_order)
values
  (null, 'Compreensão', 'compreensao', 40),
  (null, 'Fluência', 'fluencia', 50),
  (null, 'Interpretação', 'interpretacao', 60),
  (null, 'Coordenação', 'coordenacao', 70),
  (null, 'Criatividade', 'criatividade', 80),
  (null, 'Organização', 'organizacao', 90)
on conflict do nothing;

update public.lesson_metric_options
set label = 'Necessita apoio', performance_level = 1, color = '#E45757'
where value in ('low', 'much_help', 'not_completed');

update public.lesson_metric_options
set label = case when value = 'regular' then 'Em desenvolvimento' else label end,
    performance_level = 3,
    color = '#F2C94C'
where value in ('regular', 'small_help', 'partial');

update public.lesson_metric_options
set label = case when value = 'good' then 'Bom desempenho' else label end,
    performance_level = 4,
    color = '#6FCF97'
where value = 'good';

update public.lesson_metric_options
set label = case
      when value = 'excellent' then 'Excelente desempenho'
      when value = 'independent' then 'Independente'
      when value = 'completed' then 'Concluiu'
      else label
    end,
    performance_level = 5,
    color = '#219653'
where value in ('excellent', 'independent', 'completed');

insert into public.lesson_metric_options (metric_definition_id, label, value, sort_order, performance_level, color)
select d.id, 'Abaixo do esperado', 'below_expected', 20, 2, '#F2994A'
from public.lesson_metric_definitions d
where d.user_id is null and d.slug = 'participacao'
on conflict (metric_definition_id, value) do nothing;

insert into public.lesson_metric_options (metric_definition_id, label, value, sort_order, performance_level, color)
select d.id, levels.label, levels.value, levels.sort_order, levels.performance_level, levels.color
from public.lesson_metric_definitions d
join (values
  ('Necessita apoio', 'needs_support', 10, 1, '#E45757'),
  ('Abaixo do esperado', 'below_expected', 20, 2, '#F2994A'),
  ('Em desenvolvimento', 'developing', 30, 3, '#F2C94C'),
  ('Bom desempenho', 'good_performance', 40, 4, '#6FCF97'),
  ('Excelente desempenho', 'excellent_performance', 50, 5, '#219653')
) as levels(label, value, sort_order, performance_level, color) on true
where d.user_id is null
  and d.slug in ('compreensao', 'fluencia', 'interpretacao', 'coordenacao', 'criatividade', 'organizacao')
on conflict (metric_definition_id, value) do nothing;

insert into public.lesson_metric_presets (user_id, name, slug, match_terms, is_default, priority)
values
  (null, 'Padrão', 'padrao', '{}', true, 0),
  (null, 'Matemática', 'matematica', array['matematica', 'numeros', 'logica', 'raciocinio'], false, 40),
  (null, 'Leitura', 'leitura', array['leitura', 'linguagem', 'portugues', 'literatura', 'alfabetizacao'], false, 40),
  (null, 'Coordenação Motora', 'coordenacao-motora', array['coordenacao motora', 'movimento', 'motricidade'], false, 40),
  (null, 'Arte', 'arte', array['arte', 'artes', 'expressao artistica', 'pintura', 'desenho'], false, 40)
on conflict do nothing;

insert into public.lesson_metric_preset_items (preset_id, metric_definition_id, sort_order)
select p.id, d.id, mapping.sort_order
from (values
  ('padrao', 'participacao', 10),
  ('padrao', 'autonomia', 20),
  ('padrao', 'conclusao', 30),
  ('matematica', 'participacao', 10),
  ('matematica', 'compreensao', 20),
  ('matematica', 'conclusao', 30),
  ('leitura', 'fluencia', 10),
  ('leitura', 'interpretacao', 20),
  ('leitura', 'participacao', 30),
  ('coordenacao-motora', 'coordenacao', 10),
  ('coordenacao-motora', 'autonomia', 20),
  ('coordenacao-motora', 'participacao', 30),
  ('arte', 'criatividade', 10),
  ('arte', 'participacao', 20),
  ('arte', 'organizacao', 30)
) as mapping(preset_slug, metric_slug, sort_order)
join public.lesson_metric_presets p on p.slug = mapping.preset_slug and p.user_id is null
join public.lesson_metric_definitions d on d.slug = mapping.metric_slug and d.user_id is null
on conflict (preset_id, metric_definition_id) do nothing;

create or replace function public.save_class_lesson_record(
  p_class_id uuid,
  p_activity_id uuid,
  p_lesson_date date,
  p_students jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  if not exists (
    select 1 from public.classes c where c.id = p_class_id and c.user_id = v_user_id
  ) then
    raise exception 'Turma não encontrada.';
  end if;

  if not exists (
    select 1 from public.class_activities ca
    where ca.class_id = p_class_id and ca.activity_id = p_activity_id and ca.user_id = v_user_id
  ) then
    raise exception 'Esta atividade não está atribuída à turma.';
  end if;

  select a.title, a.development_area, a.methodology
    into v_activity_title, v_development_area, v_methodology
  from public.activities a
  where a.id = p_activity_id and a.user_id = v_user_id;

  if not found then
    raise exception 'Atividade não encontrada.';
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
    null,
    p_class_id,
    p_activity_id,
    p_lesson_date,
    v_activity_title,
    v_development_area,
    v_methodology,
    'class'
  )
  on conflict (user_id, class_id, activity_id, lesson_date)
    where source = 'class' and activity_id is not null
  do update set
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
        and s.class_id = p_class_id
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

grant select, insert, update, delete on public.lesson_metric_presets to authenticated;
grant select, insert, update, delete on public.lesson_metric_preset_items to authenticated;
grant execute on function public.save_class_lesson_record(uuid, uuid, date, jsonb) to authenticated;
