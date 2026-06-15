import { SupabaseClient } from "@supabase/supabase-js";

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// check_rate_limit RPCが未デプロイ等でエラーになった場合は許可する（フェイルオープン）。
// レート制限が機能しなくなるだけで、既存の挙動（無制限）より悪化はしない。
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}
