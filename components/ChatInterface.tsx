"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MovieCard } from "./MovieCard";
import { UserPreferences } from "@/lib/types";
import { useAuthStore } from "@/lib/store/authStore";
import {
  createConversation,
  appendMessage,
  loadConversationMessages,
} from "@/lib/conversations";

interface WatchProviderDetail {
  provider_name: string;
  logo_url: string;
  web_url: string;
  deep_link: string | null;
}

interface ApiRecommendation {
  movie_id: number;
  title: string;
  reason: string;
  streaming_services: string[];
  runtime_minutes: number;
  match_score: number;
  overview?: string;
  match_reason?: string;
  poster_path?: string | null;
  vote_average?: number;
  watch_providers?: WatchProviderDetail[];
  watch_link?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  options?: string[];
  recommendations?: ApiRecommendation[];
}

interface ChatInterfaceProps {
  preferences: UserPreferences;
  restoreConversationId?: string | null;
  onConversationCreated?: (id: string) => void;
}

function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

const GREETING: Message = {
  role: "assistant",
  content: "こんにちは！今のあなたにぴったりな映画をお届けするYO-IN AIです🎬\nどんな気分のときも、きっとお気に入りの1本が見つかります。\nまずはご希望の探し方を教えてください！",
  options: ["🎯 じっくり探したい（5〜6問）", "⚡ サクッと探したい（3〜4問）"],
  recommendations: [],
};

export function ChatInterface({
  preferences,
  restoreConversationId,
  onConversationCreated,
}: ChatInterfaceProps) {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeOptions, setActiveOptions] = useState<string[]>(GREETING.options ?? []);
  const [conversationId, setConversationId] = useState<string | null>(restoreConversationId ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  // Restore conversation messages when restoreConversationId is provided
  useEffect(() => {
    if (!restoreConversationId) {
      restoredRef.current = false;
      setMessages([GREETING]);
      setActiveOptions(GREETING.options ?? []);
      setConversationId(null);
      return;
    }

    restoredRef.current = true;
    loadConversationMessages(restoreConversationId).catch(() => []).then((rows) => {
      if (!rows.length) return;
      const restored: Message[] = rows.map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
        options: (r.options as string[] | null) ?? undefined,
        recommendations: (r.recommendations as ApiRecommendation[] | null) ?? undefined,
      }));
      setMessages(restored);
      const lastAssistant = [...restored].reverse().find((m) => m.role === "assistant");
      setActiveOptions(lastAssistant?.options ?? []);
    });
  }, [restoreConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function ensureConversation(firstUserMessage: string): Promise<string | null> {
    if (!user) return null;
    if (conversationId) return conversationId;

    // Title = first 30 chars of user message
    const title = firstUserMessage.slice(0, 30) + (firstUserMessage.length > 30 ? "…" : "");
    const id = await createConversation(title);
    if (id) {
      setConversationId(id);
      onConversationCreated?.(id);
    }
    return id;
  }

  const saveMessages = useCallback(
    async (convId: string, userText: string, assistantMsg: Message) => {
      await appendMessage(convId, "user", userText);
      await appendMessage(
        convId,
        "assistant",
        assistantMsg.content,
        assistantMsg.options,
        assistantMsg.recommendations
      );
    },
    []
  );

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    setActiveOptions([]);
    setIsSearching(false);

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const convId = await ensureConversation(text);

    try {
      const apiMessages = updatedMessages
        .filter((m) => m !== GREETING)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, preferences }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1];
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

          if (event === "searching") {
            setIsSearching(true);
          } else if (event === "done") {
            receivedDone = true;
            setIsSearching(false);

            let recs: ApiRecommendation[] = (payload.recommendations as ApiRecommendation[]) ?? [];
            if (recs.length > 0) {
              recs = await Promise.all(
                recs.map(async (rec) => {
                  try {
                    const params = new URLSearchParams({ id: String(rec.movie_id), title: rec.title });
                    const r = await fetch(`/api/movie?${params}`);
                    const movieData = await r.json();
                    const allProviders: WatchProviderDetail[] = movieData.watch_providers ?? [];
                    const userServices = preferences.streamingServices;
                    const watch_providers = userServices.length > 0
                      ? allProviders.filter((p) => userServices.some((s) => p.provider_name === s))
                      : allProviders;
                    return {
                      ...rec,
                      poster_path: movieData.poster_path ?? null,
                      vote_average: movieData.vote_average ?? 0,
                      watch_providers,
                      watch_link: movieData.watch_link ?? "",
                      // TMDBの実データでstreaming_servicesを上書き（AI出力の誤りを防ぐ）
                      streaming_services: watch_providers.map((p) => p.provider_name),
                    };
                  } catch {
                    return rec;
                  }
                })
              );
            }

            const opts: string[] = (payload.options as string[]) ?? [];
            const assistantMessage: Message = {
              role: "assistant",
              content: (payload.message as string) ?? "",
              options: opts,
              recommendations: recs,
            };
            setMessages((prev) => [...prev, assistantMessage]);
            setActiveOptions(opts);

            if (convId) {
              await saveMessages(convId, text, assistantMessage);
            }
          } else if (event === "error") {
            receivedDone = true;
            setIsSearching(false);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: (payload.message as string) ?? "エラーが発生しました。もう一度お試しください。", options: ["🔄 もう一度試す"] },
            ]);
            setActiveOptions(["🔄 もう一度試す"]);
          }
        }
      }

      // ストリームがdoneイベントなしで終了した場合（タイムアウトなど）
      if (!receivedDone) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "応答に時間がかかりすぎました。もう一度お試しください。", options: ["🔄 もう一度試す"] },
        ]);
        setActiveOptions(["🔄 もう一度試す"]);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.includes("529")
          ? "APIが混み合っています。少し待ってからもう一度お試しください。"
          : "エラーが発生しました。もう一度お試しください。";
      setMessages((prev) => [...prev, { role: "assistant", content: msg, options: ["🔄 もう一度試す"] }]);
      setActiveOptions(["🔄 もう一度試す"]);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto pr-2 min-h-0">
        <div className="flex flex-col gap-4 py-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[80%] bg-emerald-400/20 border border-emerald-400/30 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
                          <Image src="/yoin-ai-icon.png" alt="YO-IN AI" width={32} height={32} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 bg-white/5 border border-white/10 text-white/85 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                          {renderBold(msg.content)}
                        </div>
                      </div>

                      {msg.recommendations && msg.recommendations.length > 0 && (
                        <div className="ml-11 flex flex-col gap-3">
                          {msg.recommendations.map((rec, j) => (
                            <MovieCard key={rec.movie_id} recommendation={rec} rank={j} />
                          ))}
                        </div>
                      )}

                      {isLast && !isLoading && activeOptions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.15 }}
                          className="ml-0 sm:ml-11 grid grid-cols-2 sm:flex sm:flex-wrap gap-2"
                        >
                          {activeOptions.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => sendMessage(opt)}
                              className="text-xs sm:text-sm px-3 py-2 rounded-xl sm:rounded-full border border-emerald-400/40 text-emerald-400/80 hover:border-emerald-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all text-left leading-snug"
                            >
                              {opt}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <Image src="/yoin-ai-icon.png" alt="YO-IN AI" width={32} height={32} className="w-full h-full object-cover" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-white/50 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                {isSearching ? "映画を検索しています..." : "考えています..."}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="メッセージを入力..."
          disabled={isLoading}
          className="flex-1 bg-white/5 border-white/20 text-white placeholder:text-white/30 focus:border-emerald-400/50"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          className="bg-emerald-400 hover:bg-emerald-300 text-black font-bold px-4 disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
