create or replace function public.create_lesson_metric_definition(
  p_name text,
  p_labels text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_metric_id uuid := gen_random_uuid();
  v_name text := trim(p_name);
  v_count integer := coalesce(array_length(p_labels, 1), 0);
  v_levels smallint[];
  v_colors text[];
  v_sort_order integer;
  v_index integer;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if v_name = '' then
    raise exception 'Informe o nome do critério.';
  end if;

  if v_count < 2 or v_count > 5 then
    raise exception 'O critério deve possuir entre 2 e 5 níveis.';
  end if;

  for v_index in 1..v_count loop
    if trim(coalesce(p_labels[v_index], '')) = '' then
      raise exception 'Preencha a legenda de todos os níveis.';
    end if;
  end loop;

  v_levels := case v_count
    when 2 then array[1, 5]::smallint[]
    when 3 then array[1, 3, 5]::smallint[]
    when 4 then array[1, 2, 4, 5]::smallint[]
    else array[1, 2, 3, 4, 5]::smallint[]
  end;
  v_colors := case v_count
    when 2 then array['#E45757', '#219653']
    when 3 then array['#E45757', '#F2C94C', '#219653']
    when 4 then array['#E45757', '#F2994A', '#6FCF97', '#219653']
    else array['#E45757', '#F2994A', '#F2C94C', '#6FCF97', '#219653']
  end;

  select coalesce(max(sort_order), 100) + 10
    into v_sort_order
  from public.lesson_metric_definitions
  where user_id = v_user_id;

  insert into public.lesson_metric_definitions (
    id,
    user_id,
    name,
    slug,
    is_active,
    sort_order
  ) values (
    v_metric_id,
    v_user_id,
    v_name,
    'personalizado-' || replace(v_metric_id::text, '-', ''),
    true,
    v_sort_order
  );

  for v_index in 1..v_count loop
    insert into public.lesson_metric_options (
      metric_definition_id,
      label,
      value,
      sort_order,
      performance_level,
      color
    ) values (
      v_metric_id,
      trim(p_labels[v_index]),
      'nivel-' || v_index,
      v_index * 10,
      v_levels[v_index],
      v_colors[v_index]
    );
  end loop;

  return v_metric_id;
end;
$$;

grant execute on function public.create_lesson_metric_definition(text, text[]) to authenticated;
