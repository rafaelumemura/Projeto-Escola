alter table public.profiles
  add column if not exists material_printable_v2 boolean not null default false;

update public.profiles
set material_printable_v2 = true
where id = '0a245662-f940-4fa6-8dba-5ea0036057b9'::uuid
   or lower(email) = 'rafaelumemura@gmail.com';

create table if not exists public.printable_ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  briefing_json jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  generated_at timestamp with time zone not null default now(),
  generation_time integer,
  status text not null check (status in ('success', 'failed')),
  error_message text
);

create index if not exists printable_ai_generations_user_idx
  on public.printable_ai_generations (user_id, generated_at desc);

create index if not exists printable_ai_generations_activity_idx
  on public.printable_ai_generations (activity_id, generated_at desc);

alter table public.printable_ai_generations enable row level security;

drop policy if exists "Users can read own printable AI logs" on public.printable_ai_generations;
create policy "Users can read own printable AI logs"
on public.printable_ai_generations
for select
to authenticated
using (auth.uid() = user_id);
