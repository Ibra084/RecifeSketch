-- Recife Sketch: student whiteboards + school-domain sign-up blocking.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

-- ─── Whiteboards ────────────────────────────────────────────────────────────
-- One row per saved board. `snapshot` is the tldraw document snapshot.
create table if not exists public.whiteboards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled whiteboard'
              check (char_length(title) between 1 and 80),
  snapshot    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists whiteboards_user_updated_idx
  on public.whiteboards (user_id, updated_at desc);

alter table public.whiteboards enable row level security;

-- Students can only ever see and change their own boards.
drop policy if exists "whiteboards_select_own" on public.whiteboards;
create policy "whiteboards_select_own" on public.whiteboards
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "whiteboards_insert_own" on public.whiteboards;
create policy "whiteboards_insert_own" on public.whiteboards
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "whiteboards_update_own" on public.whiteboards;
create policy "whiteboards_update_own" on public.whiteboards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "whiteboards_delete_own" on public.whiteboards;
create policy "whiteboards_delete_own" on public.whiteboards
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.whiteboards from anon;
grant select, insert, update, delete on public.whiteboards to authenticated;

create or replace function public.touch_whiteboard_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whiteboards_touch_updated_at on public.whiteboards;
create trigger whiteboards_touch_updated_at
  before update on public.whiteboards
  for each row execute function public.touch_whiteboard_updated_at();

-- ─── Blocked sign-up domains ────────────────────────────────────────────────
-- School-issued addresses may not be used for personal accounts. This table
-- is the single configurable list: add/remove rows to change it. RLS is on
-- with no policies, so only the service role and the auth hook can read it.
create table if not exists public.blocked_email_domains (
  domain      text primary key check (domain = lower(domain) and domain !~ '^@'),
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.blocked_email_domains enable row level security;
revoke all on public.blocked_email_domains from anon, authenticated;

insert into public.blocked_email_domains (domain, note)
values ('jess.sch.ae', 'Jumeirah English Speaking School')
on conflict (domain) do nothing;

-- Matches the domain itself and any subdomain (mirrors isBlockedEmailDomain
-- in src/lib/auth/identity.ts).
create or replace function public.is_blocked_email_domain(email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_email_domains b
    where lower(split_part(email, '@', 2)) = b.domain
       or lower(split_part(email, '@', 2)) like '%.' || b.domain
  );
$$;

revoke execute on function public.is_blocked_email_domain(text) from public, anon, authenticated;

-- Supabase Auth "Before User Created" hook. Enforces the block inside Auth
-- itself, so it holds even for sign-ups that bypass the Recife Sketch UI.
-- Enable in Dashboard → Authentication → Hooks → Before User Created →
-- Postgres function `public.hook_before_user_created`.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  new_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if new_email <> '' and public.is_blocked_email_domain(new_email) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'School email addresses can''t be used. Please use a personal email address.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.is_blocked_email_domain(text) to supabase_auth_admin;
grant select on public.blocked_email_domains to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
