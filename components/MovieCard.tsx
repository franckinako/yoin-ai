"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, Clock, Bookmark } from "lucide-react";
import { StreamingBadge } from "./StreamingBadge";
import { useAuthStore } from "@/lib/store/authStore";
import { saveMovie, unsaveMovie, getSavedMovieIds } from "@/lib/conversations";

interface MovieCardData {
  movie_id: number;
  title: string;
  reason: string;
  streaming_services: string[];
  runtime_minutes: number;
  match_score: number;
  poster_path?: string | null;
  vote_average?: number;
}

interface MovieCardProps {
  recommendation: MovieCardData;
  rank: number;
}

const REASON_LIMIT = 70;

// Shared saved IDs cache (simple module-level cache to avoid repeated fetches)
let savedIdsCache: Set<number> | null = null;
let savedIdsCachePromise: Promise<Set<number>> | null = null;

async function getCachedSavedIds(): Promise<Set<number>> {
  if (savedIdsCache) return savedIdsCache;
  if (!savedIdsCachePromise) {
    savedIdsCachePromise = getSavedMovieIds().then((ids) => {
      savedIdsCache = ids;
      return ids;
    });
  }
  return savedIdsCachePromise;
}

function invalidateSavedIdsCache() {
  savedIdsCache = null;
  savedIdsCachePromise = null;
}

export function MovieCard({ recommendation, rank }: MovieCardProps) {
  const { movie_id, title, reason, streaming_services, runtime_minutes, match_score, poster_path, vote_average } =
    recommendation;
  const user = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const posterUrl = poster_path
    ? `https://image.tmdb.org/t/p/w500${poster_path}`
    : null;

  const isLong = reason.length > REASON_LIMIT;
  const displayedReason = isLong && !expanded ? reason.slice(0, REASON_LIMIT) + "…" : reason;

  useEffect(() => {
    if (!user) return;
    getCachedSavedIds().then((ids) => setSaved(ids.has(movie_id)));
  }, [user, movie_id]);

  async function toggleSave() {
    if (!user || saving) return;
    setSaving(true);
    if (saved) {
      await unsaveMovie(movie_id);
      setSaved(false);
    } else {
      await saveMovie({
        movie_id,
        title,
        poster_path: poster_path ?? null,
        reason,
        streaming_services,
        vote_average,
        runtime_minutes,
        match_score,
      });
      setSaved(true);
    }
    invalidateSavedIdsCache();
    setSaving(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rank * 0.1 }}
      className="group relative flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4 hover:border-yellow-400/40 hover:bg-white/8 transition-all duration-300"
    >
      {/* Rank badge */}
      <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-yellow-400 text-black text-xs font-bold flex items-center justify-center z-10">
        {rank + 1}
      </div>

      {/* Poster */}
      <div className="relative flex-shrink-0 w-20 h-[120px] rounded-lg overflow-hidden bg-white/10">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="80px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-xs text-center px-1">
            No Image
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-white text-base leading-tight line-clamp-2 flex-1">
            {title}
          </h3>
          {user && (
            <button
              onClick={toggleSave}
              disabled={saving}
              className={`flex-shrink-0 p-1 transition-all ${
                saved
                  ? "text-yellow-400"
                  : "text-white/20 hover:text-white/50"
              }`}
              title={saved ? "保存済み" : "保存する"}
            >
              <Bookmark className={`w-4 h-4 ${saved ? "fill-yellow-400" : ""}`} />
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 mb-2 text-xs text-white/50">
          {vote_average != null && vote_average > 0 && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              {vote_average.toFixed(1)}
            </span>
          )}
          {runtime_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {runtime_minutes}分
            </span>
          )}
        </div>

        {/* Reason */}
        <p className="text-sm text-white/70 mb-1 leading-relaxed">
          {displayedReason}
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-1 text-yellow-400/70 hover:text-yellow-400 text-xs transition-colors"
            >
              {expanded ? "閉じる" : "もっと見る"}
            </button>
          )}
        </p>

        {/* Streaming services */}
        {streaming_services.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {streaming_services.map((s) => (
              <StreamingBadge key={s} serviceName={s} />
            ))}
          </div>
        )}

        {/* Match score */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/40">マッチ度</span>
            <span className="text-xs font-bold text-yellow-400">{match_score}%</span>
          </div>
          <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-yellow-300"
              initial={{ width: 0 }}
              animate={{ width: `${match_score}%` }}
              transition={{ duration: 0.8, delay: rank * 0.1 + 0.3 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
