"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ChatInterface } from "@/components/ChatInterface";
import { AuthButton } from "@/components/AuthButton";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { UserPreferences } from "@/lib/types";
import { STREAMING_SERVICE_NAMES } from "@/lib/streaming-providers";
import { ArrowRight, SkipForward, Bookmark, Tv2 } from "lucide-react";

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
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [started, setStarted] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  // ページ読み込み時にlocalStorageから復元し、選択済みなら直接チャット画面へ
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
    if (ignoreServices) {
      setPreferences({ ...preferences, streamingServices: [] });
    }
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
    <main className="min-h-[100dvh] bg-[#0a0a0f] text-white flex flex-col">
      {/* Sidebar */}
      <ConversationSidebar
        currentConversationId={conversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
      />

      {/* Header */}
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-2 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-20">
        <span className="text-xl">🎬</span>
        <h1 className="font-bold text-base text-white leading-none whitespace-nowrap" style={{ fontFamily: "serif" }}>
          YO-IN AI
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/saved"
            className="flex items-center gap-1 text-xs text-white/40 hover:text-yellow-400/70 transition-colors"
          >
            <Bookmark className="w-4 h-4" />
            <span className="hidden sm:inline">保存済み</span>
          </Link>
          {started && (
            <button
              onClick={() => { try { localStorage.removeItem(STORAGE_KEY); } catch {} setStarted(false); }}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80 transition-all whitespace-nowrap"
            >
              <Tv2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">配信サービスを変更</span>
            </button>
          )}
          <AuthButton />
        </div>
      </header>

      <AnimatePresence mode="wait">
        {!started ? (
          /* ── サービス選択画面 ── */
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col items-center justify-center px-6 py-12"
          >
            <div className="w-full max-w-md flex flex-col items-center gap-8">
              <div className="text-center">
                <p className="text-yellow-400 text-sm font-medium tracking-widest uppercase mb-2">Step 1</p>
                <h2 className="text-2xl font-bold text-white mb-2">契約中のサービスを選んでください</h2>
                <p className="text-sm text-white/40">視聴できる映画を優先して推薦します</p>
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
                      <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${active ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/30"}`}>
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
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/15 text-white/50 hover:border-white/30 hover:text-white/70 transition-all text-sm"
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col min-h-0 px-3 sm:px-6 py-3 sm:py-4 max-w-3xl mx-auto w-full"
            style={{ height: "calc(100dvh - 56px)" }}
          >
            <ChatInterface
              preferences={preferences}
              restoreConversationId={restoreId}
              onConversationCreated={setConversationId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
