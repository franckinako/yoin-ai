import { NextRequest, NextResponse } from "next/server";
import { getGenres } from "@/lib/tmdb";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const allowed = await checkRateLimit(supabase, `genres:${getClientIp(req)}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const genres = await getGenres();
    return NextResponse.json(genres);
  } catch {
    return NextResponse.json([]);
  }
}
