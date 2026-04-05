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
