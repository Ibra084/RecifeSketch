-- Recife Sketch: Mistake Memory.
-- Run once in the Supabase SQL editor (after the earlier migrations). Safe to re-run.
--
-- One row per misconception a student chose to save after a VERIFIED mistake.
-- Deliberately minimal: no screenshots, no conversation history, no names.
-- `subject` is part of every row so other subjects can be added later.

create table if not exists public.mistakes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject               text not null default 'maths' check (subject in ('maths')),
  skill                 text not null check (skill in ('expand_brackets', 'simplify_expression', 'solve_linear_equation')),
  concept               text not null check (char_length(concept) between 1 and 80),
  misconception         text not null check (char_length(misconception) between 1 and 240),
  incorrect_step        text not null check (char_length(incorrect_step) between 1 and 200),
  correct_relationship  text not null check (char_length(correct_relationship) between 1 and 240),
  hint                  text not null check (char_length(hint) between 1 and 300),
  source_board_id       uuid references public.whiteboards (id) on delete set null,
  practice_status       text not null default 'not_practised'
                        check (practice_status in ('not_practised', 'needs_practice', 'practised')),
  practice_attempts     integer not null default 0 check (practice_attempts >= 0),
  practice_question     jsonb,
  practice_board_id     uuid references public.whiteboards (id) on delete set null,
  last_practised_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists mistakes_user_created_idx on public.mistakes (user_id, created_at desc);
create index if not exists mistakes_practice_board_idx on public.mistakes (practice_board_id);

alter table public.mistakes enable row level security;

-- A student can only ever see, add, change or delete their own mistakes.
drop policy if exists "mistakes_select_own" on public.mistakes;
create policy "mistakes_select_own" on public.mistakes
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "mistakes_insert_own" on public.mistakes;
create policy "mistakes_insert_own" on public.mistakes
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "mistakes_update_own" on public.mistakes;
create policy "mistakes_update_own" on public.mistakes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "mistakes_delete_own" on public.mistakes;
create policy "mistakes_delete_own" on public.mistakes
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.mistakes from anon;
grant select, insert, update, delete on public.mistakes to authenticated;

drop trigger if exists mistakes_touch_updated_at on public.mistakes;
create trigger mistakes_touch_updated_at
  before update on public.mistakes
  for each row execute function public.touch_whiteboard_updated_at();
