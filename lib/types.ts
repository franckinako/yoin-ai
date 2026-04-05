export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  runtime?: number;
  genres?: { id: number; name: string }[];
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface MovieRecommendation {
  movie: Movie;
  reason: string;
  watchProviders: WatchProvider[];
  matchScore: number; // 0-100
}

export interface UserPreferences {
  availableMinutes: number;
  streamingServices: string[];
  genres: number[];
  mood: string;
  favoriteMovies: string[];
  language: "ja" | "en" | "any";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  recommendations?: MovieRecommendation[];
}
