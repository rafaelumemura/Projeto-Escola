alter table public.printable_ai_generations
  add column if not exists event_type text not null default 'generation',
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'printable_ai_generations_event_type_check'
  ) then
    alter table public.printable_ai_generations
      add constraint printable_ai_generations_event_type_check
      check (event_type in ('generation', 'download', 'blocked'));
  end if;
end $$;

create index if not exists printable_ai_generations_monthly_usage_idx
  on public.printable_ai_generations (user_id, event_type, status, generated_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('printable-materials', 'printable-materials', false, 10485760, array['application/pdf'])
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];
