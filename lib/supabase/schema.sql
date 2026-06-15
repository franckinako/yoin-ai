-- Supabase SQLエディタで実行してください

create table conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  created_at timestamptz default now() not null
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  options jsonb,
  recommendations jsonb,
  created_at timestamptz default now() not null
);

create table saved_movies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  movie_id integer not null,
  title text not null,
  poster_path text,
  reason text,
  streaming_services text[] default '{}',
  vote_average numeric,
  runtime_minutes integer,
  match_score integer,
  saved_at timestamptz default now() not null,
  unique(user_id, movie_id)
);

-- RLS有効化
alter table conversations enable row level security;
alter table messages enable row level security;
alter table saved_movies enable row level security;

-- 自分のデータのみアクセス可能
create policy "own conversations" on conversations for all using (auth.uid() = user_id);
create policy "own messages" on messages for all using (
  auth.uid() = (select user_id from conversations where id = conversation_id)
);
create policy "own saved movies" on saved_movies for all using (auth.uid() = user_id);

-- ============================================
-- レート制限用（追加マイグレーション）
-- 既存環境に追加する場合はこの部分のみ実行してください
-- ============================================

create table rate_limits (
  key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now()
);

alter table rate_limits enable row level security;
-- ポリシーは作成しない（直接アクセス不可）。check_rate_limit関数経由のみ許可する。

-- IPごとのリクエスト数をアトミックにカウントし、上限超過なら false を返す
create or replace function check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
            then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
            then now()
          else rate_limits.window_start
        end
  returning count into current_count;

  return current_count <= p_limit;
end;
$$;

grant execute on function check_rate_limit(text, integer, integer) to anon, authenticated;
