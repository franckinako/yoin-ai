"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ChatInterface } from "@/components/ChatInterface";
import { AuthButton } from "@/components/AuthButton";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { useAuthStore } from "@/lib/store/authStore";
import { UserPreferences } from "@/lib/types";
import { STREAMING_SERVICE_NAMES } from "@/lib/streaming-providers";
import { ArrowRight, SkipForward, Bookmark, Tv2, Menu } from "lucide-react";

const DEFAULT_PREFERENCES: UserPreferences = {
  availableMinutes: 120,
  streamingServices: [],
  genres: [],
  mood: "",
  favoriteMovies: [],
  language: "ja",
};

const STORAGE_KEY = "yoin-ai:services";

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [started, setStarted] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const services: string[] = JSON.parse(saved);
        setPreferences((p) => ({ ...p, streamingServices: services }));
        setStarted(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("error=access_denied") && hash.includes("otp_expired")) {
      setAuthError("メール確認リンクの有効期限が切れています。再度サインアップしてください。");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function toggleService(service: string) {
    const current = preferences.streamingServices;
    setPreferences({
      ...preferences,
      streamingServices: current.includes(service)
        ? current.filter((s) => s !== service)
        : [...current, service],
    });
  }

  function start(ignoreServices = false) {
    const services = ignoreServices ? [] : preferences.streamingServices;
    if (ignoreServices) setPreferences({ ...preferences, streamingServices: [] });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(services)); } catch {}
    setRestoreId(null);
    setConversationId(null);
    setStarted(true);
  }

  function handleSelectConversation(id: string) {
    setRestoreId(id);
    setConversationId(id);
    setStarted(true);
  }

  function handleNewConversation() {
    setRestoreId(null);
    setConversationId(null);
    setStarted(false);
  }

  return (
    <div className="h-[100dvh] bg-[#0a0a0f] text-white flex overflow-hidden">
      {/* Sidebar */}
      <ConversationSidebar
        currentConversationId={conversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="border-b border-white/8 px-4 py-3 flex items-center gap-2 bg-[#0a0a0f] flex-shrink-0">
          {/* Mobile menu button */}
          {user && (
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 text-white/40 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <span className="text-base">🎬</span>
          <h1 className="font-bold text-sm text-white leading-none whitespace-nowrap" style={{ fontFamily: "serif" }}>
            YO-IN AI
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/saved"
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">保存済み</span>
            </Link>
            {started && (
              <button
                onClick={() => { try { localStorage.removeItem(STORAGE_KEY); } catch {} setStarted(false); }}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors whitespace-nowrap"
              >
                <Tv2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">サービス変更</span>
              </button>
            )}
            <AuthButton />
          </div>
        </header>

        {authError && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs text-center flex-shrink-0">
            {authError}
          </div>
        )}

        <AnimatePresence mode="wait">
          {!started ? (
            /* ── サービス選択画面 ── */
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto"
            >
              <div className="w-full max-w-md flex flex-col items-center gap-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-white mb-1.5">契約中のサービスを選択</h2>
                  <p className="text-sm text-white/35">視聴できる映画を優先して推薦します</p>
                </div>

                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STREAMING_SERVICE_NAMES.map((service) => {
                    const active = preferences.streamingServices.includes(service);
                    return (
                      <button
                        key={service}
                        onClick={() => toggleService(service)}
                        className={`px-4 py-3 rounded-xl border text-sm text-left transition-all flex items-center gap-2 ${
                          active
                            ? "border-yellow-400/70 bg-yellow-400/15 text-white font-medium"
                            : "border-white/15 text-white/50 hover:border-white/30 hover:text-white/70"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${
                          active ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/30"
                        }`}>
                          {active && "✓"}
                        </span>
                        {service}
                      </button>
                    );
                  })}
                </div>

                <div className="w-full flex flex-col gap-3">
                  <button
                    onClick={() => start(false)}
                    disabled={preferences.streamingServices.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    選択したサービスで始める
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => start(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/20 text-white/60 hover:border-white/35 hover:text-white/80 transition-all text-sm"
                  >
                    <SkipForward className="w-4 h-4" />
                    サービスに関わらず映画を探す
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── チャット画面 ── */
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0 overflow-hidden px-3 sm:px-6 py-3 sm:py-4 max-w-3xl mx-auto w-full"
            >
              <ChatInterface
                preferences={preferences}
                restoreConversationId={restoreId}
                onConversationCreated={setConversationId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
