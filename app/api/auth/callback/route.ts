import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  if (token_hash && type) {
    await supabase.auth.verifyOtp({ token_hash, type: type as "signup" | "email" });
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectTo = token_hash ? `${origin}/auth/confirmed` : `${origin}/`;
  return NextResponse.redirect(redirectTo);
}
