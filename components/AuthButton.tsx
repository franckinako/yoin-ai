"use client";

import { useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/store/authStore";
import { LogIn, LogOut } from "lucide-react";
import { AuthModal } from "./AuthModal";

export function AuthButton() {
  const user = useAuthStore((s) => s.user);
  const [showModal, setShowModal] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  if (!isSupabaseConfigured()) return null;

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/60 hover:border-emerald-400/50 hover:text-white transition-all"
        >
          <LogIn className="w-4 h-4" />
          <span>ログイン</span>
        </button>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="hidden sm:flex items-center gap-1 text-xs text-white/40">
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
