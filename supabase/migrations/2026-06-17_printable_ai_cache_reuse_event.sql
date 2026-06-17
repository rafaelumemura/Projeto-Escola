alter table public.printable_ai_generations
  drop constraint if exists printable_ai_generations_event_type_check;

alter table public.printable_ai_generations
  add constraint printable_ai_generations_event_type_check
  check (event_type in ('generation', 'download', 'blocked', 'cache_reuse'));
