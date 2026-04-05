import { Movie, WatchProvider } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function safeFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function searchMovies(query: string, language = "ja-JP"): Promise<Movie[]> {
  const data = await safeFetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&language=${language}`
  ) as { results: Movie[] };
  return data.results ?? [];
}

export async function discoverMovies(params: {
  with_genres?: string;
  "with_runtime.lte"?: number;
  "with_runtime.gte"?: number;
  sort_by?: string;
  language?: string;
  "vote_average.gte"?: number;
  page?: number;
  pages?: number; // 取得するページ数（デフォルト3）
}): Promise<Movie[]> {
  const { pages = 3, ...rest } = params;
  const baseParams = {
    language: "ja-JP",
    sort_by: "popularity.desc",
    "vote_average.gte": "5",
    ...Object.fromEntries(
      Object.entries(rest)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ),
  };

  const allResults = await Promise.all(
    Array.from({ length: pages }, (_, i) => i + 1).map(async (page) => {
      const query = new URLSearchParams({ ...baseParams, page: String(page) });
      try {
        const data = await safeFetch(`${TMDB_BASE}/discover/movie?${query}`) as { results: Movie[] };
        return (data.results ?? []) as Movie[];
      } catch {
        return [] as Movie[];
      }
    })
  );

  // 重複除去してフラット化
  const seen = new Set<number>();
  return allResults.flat().filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export async function getMovieDetails(movieId: number): Promise<Movie> {
  const data = await safeFetch(`${TMDB_BASE}/movie/${movieId}?language=ja-JP`);
  return data as Movie;
}

export async function getSimilarMovies(movieId: number): Promise<Movie[]> {
  const data = await safeFetch(
    `${TMDB_BASE}/movie/${movieId}/similar?language=ja-JP`
  ) as { results: Movie[] };
  return data.results ?? [];
}

export async function getWatchProviders(movieId: number): Promise<WatchProvider[]> {
  const data = await safeFetch(`${TMDB_BASE}/movie/${movieId}/watch/providers`) as {
    results?: { JP?: { flatrate?: WatchProvider[] } };
  };
  return data.results?.JP?.flatrate ?? [];
}

export async function getGenres(): Promise<{ id: number; name: string }[]> {
  const res = await fetch(
    `${TMDB_BASE}/genre/movie/list?language=ja-JP`,
    { headers: getHeaders() }
  );
  const data = await res.json();
  return data.genres as { id: number; name: string }[];
}
