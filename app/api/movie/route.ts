import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails, getWatchProviders, searchMovies } from "@/lib/tmdb";
import { SERVICE_DEEP_LINKS } from "@/lib/streaming-providers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function titleMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const title = req.nextUrl.searchParams.get("title") ?? "";
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const allowed = await checkRateLimit(supabase, `movie:${getClientIp(req)}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    let movieId = Number(id);

    // Verify the ID matches the title; fall back to search if mismatch
    if (title) {
      const movieCheck = await getMovieDetails(movieId).catch(() => null);
      if (
        movieCheck &&
        !titleMatches(movieCheck.title ?? "", title) &&
        !titleMatches((movieCheck as { original_title?: string }).original_title ?? "", title)
      ) {
        const results = await searchMovies(title).catch(() => []);
        if (results.length > 0) movieId = results[0].id;
      }
    }

    const [movie, { providers, link }] = await Promise.all([
      getMovieDetails(movieId),
      getWatchProviders(movieId).catch(() => ({ providers: [], link: "" })),
    ]);

    // TMDB provider_name → 表示名のマッピング（TMDBは"Disney Plus"など異なる表記を使う）
    const TMDB_NAME_MAP: Record<string, string> = {
      "Netflix": "Netflix",
      "Amazon Prime Video": "Amazon Prime Video",
      "Disney Plus": "Disney+",
      "Disney+": "Disney+",
      "Hulu": "Hulu",
      "Apple TV Plus": "Apple TV+",
      "Apple TV+": "Apple TV+",
      "U-NEXT": "U-NEXT",
    };
    const normalize = (name: string): string =>
      TMDB_NAME_MAP[name] ??
      Object.entries(TMDB_NAME_MAP).find(([k]) => name.startsWith(k))?.[1] ??
      name;

    const seen = new Set<string>();
    const watch_providers = providers
      .map((p) => ({ ...p, baseName: normalize(p.provider_name) }))
      .filter(({ baseName }) => {
        if (seen.has(baseName)) return false;
        seen.add(baseName);
        return true;
      })
      .map(({ baseName, logo_path }) => ({
        provider_name: baseName,
        logo_url: `https://image.tmdb.org/t/p/original${logo_path}`,
        web_url: link,
        deep_link: SERVICE_DEEP_LINKS[baseName]?.(title) ?? null,
      }));

    return NextResponse.json({
      poster_path: movie.poster_path ?? null,
      vote_average: movie.vote_average ?? 0,
      watch_providers,
      watch_link: link,
    });
  } catch {
    return NextResponse.json({ poster_path: null, vote_average: 0, watch_providers: [], watch_link: "" });
  }
}
