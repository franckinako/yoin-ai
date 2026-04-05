import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const movie = await getMovieDetails(Number(id));
    return NextResponse.json({
      poster_path: movie.poster_path ?? null,
      vote_average: movie.vote_average ?? 0,
    });
  } catch {
    return NextResponse.json({ poster_path: null, vote_average: 0 });
  }
}
