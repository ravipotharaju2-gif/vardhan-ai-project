-- Vardhan AI: run this entire script in Supabase SQL Editor.
-- Tables are private to each authenticated user. Do not disable RLS.

create extension if not exists pgcrypto;

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists chat_sessions_user_updated_idx
  on public.chat_sessions(user_id, updated_at desc);
alter table public.chat_sessions enable row level security;
drop policy if exists "Users can read their own chats" on public.chat_sessions;
drop policy if exists "Users can insert their own chats" on public.chat_sessions;
drop policy if exists "Users can update their own chats" on public.chat_sessions;
drop policy if exists "Users can delete their own chats" on public.chat_sessions;
create policy "Users can read their own chats" on public.chat_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own chats" on public.chat_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own chats" on public.chat_sessions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own chats" on public.chat_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index if not exists user_memories_user_created_idx
  on public.user_memories(user_id, created_at desc);
alter table public.user_memories enable row level security;
drop policy if exists "Users can read their own memories" on public.user_memories;
drop policy if exists "Users can insert their own memories" on public.user_memories;
drop policy if exists "Users can delete their own memories" on public.user_memories;
create policy "Users can read their own memories" on public.user_memories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own memories" on public.user_memories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can delete their own memories" on public.user_memories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Private daily request counter. Clients cannot read/write this table directly.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.consume_ai_quota(p_limit integer default 30)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 30), 200));
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.ai_usage(user_id, usage_date, request_count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date)
  do update set request_count = public.ai_usage.request_count + 1
  where public.ai_usage.request_count < safe_limit;
  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;
revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
