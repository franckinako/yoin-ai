import { createClient } from "./supabase/client";

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
}

export interface SavedMovie {
  id: string;
  movie_id: number;
  title: string;
  poster_path: string | null;
  reason: string | null;
  streaming_services: string[];
  vote_average: number | null;
  runtime_minutes: number | null;
  match_score: number | null;
  saved_at: string;
}

export async function createConversation(title: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title })
    .select("id")
    .single();
  if (error) return null;
  return data.id;
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  options?: string[],
  recommendations?: unknown[]
) {
  const supabase = createClient();
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    options: options ?? null,
    recommendations: recommendations ?? null,
  });
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

export async function loadConversationMessages(conversationId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("messages")
    .select("role, content, options, recommendations")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function deleteConversation(conversationId: string) {
  const supabase = createClient();
  await supabase.from("conversations").delete().eq("id", conversationId);
}

export async function saveMovie(movie: {
  movie_id: number;
  title: string;
  poster_path?: string | null;
  reason?: string;
  streaming_services?: string[];
  vote_average?: number;
  runtime_minutes?: number;
  match_score?: number;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("saved_movies").upsert(
    {
      movie_id: movie.movie_id,
      title: movie.title,
      poster_path: movie.poster_path ?? null,
      reason: movie.reason ?? null,
      streaming_services: movie.streaming_services ?? [],
      vote_average: movie.vote_average ?? null,
      runtime_minutes: movie.runtime_minutes ?? null,
      match_score: movie.match_score ?? null,
    },
    { onConflict: "user_id,movie_id" }
  );
  return !error;
}

export async function unsaveMovie(movieId: number) {
  const supabase = createClient();
  await supabase.from("saved_movies").delete().eq("movie_id", movieId);
}

export async function getSavedMovies(): Promise<SavedMovie[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("saved_movies")
    .select("*")
    .order("saved_at", { ascending: false });
  return data ?? [];
}

export async function getSavedMovieIds(): Promise<Set<number>> {
  const supabase = createClient();
  const { data } = await supabase.from("saved_movies").select("movie_id");
  return new Set((data ?? []).map((r) => r.movie_id));
}
