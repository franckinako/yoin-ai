"use client";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/store/authStore";
import { LogIn, LogOut, User } from "lucide-react";

export function AuthButton() {
  const user = useAuthStore((s) => s.user);

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  if (!isSupabaseConfigured()) return null;

  if (!user) {
    return (
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-white/15 text-white/60 hover:border-yellow-400/50 hover:text-white transition-all"
      >
        <LogIn className="w-4 h-4" />
        ログイン
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="hidden sm:flex items-center gap-1 text-xs text-white/40">
        <User className="w-3.5 h-3.5" />
        <span className="max-w-[100px] truncate">{user.email}</span>
      </div>
      <button
        onClick={signOut}
        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-white/10 text-white/40 hover:border-white/25 hover:text-white/60 transition-all"
        title="ログアウト"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span className="sm:hidden text-xs">ログアウト</span>
      </button>
    </div>
  );
}
