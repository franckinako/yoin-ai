"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Bookmark, Star, Clock, Trash2 } from "lucide-react";
import { getSavedMovies, unsaveMovie, SavedMovie } from "@/lib/conversations";
import { StreamingBadge } from "@/components/StreamingBadge";
import { useAuthStore } from "@/lib/store/authStore";

export default function SavedPage() {
  const user = useAuthStore((s) => s.user);
  const [movies, setMovies] = useState<SavedMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getSavedMovies().then((data) => {
      setMovies(data);
      setLoading(false);
    });
  }, [user]);

  async function handleRemove(movieId: number) {
    await unsaveMovie(movieId);
    setMovies((prev) => prev.filter((m) => m.movie_id !== movieId));
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-3 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          戻る
        </Link>
        <div className="flex items-center gap-2 ml-2">
          <Bookmark className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          <h1 className="font-bold text-white">保存した映画</h1>
        </div>
        <span className="ml-auto text-xs text-white/30">{movies.length}本</span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {!user ? (
          <div className="text-center py-20 text-white/40">
            <p>ログインすると映画を保存できます</p>
          </div>
        ) : loading ? (
          <div className="text-center py-20 text-white/40 text-sm">読み込み中...</div>
        ) : movies.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>保存した映画はありません</p>
            <Link href="/" className="mt-4 inline-block text-sm text-yellow-400/70 hover:text-yellow-400 transition-colors">
              映画を探す →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {movies.map((movie, i) => {
              const posterUrl = movie.poster_path
                ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                : null;
              return (
                <motion.div
                  key={movie.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="group flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4 hover:border-yellow-400/30 transition-all"
                >
                  {/* Poster */}
                  <div className="relative flex-shrink-0 w-20 h-[120px] rounded-lg overflow-hidden bg-white/10">
                    {posterUrl ? (
                      <Image
                        src={posterUrl}
                        alt={movie.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="80px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                        No Image
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-base leading-tight mb-1">{movie.title}</h3>

                    <div className="flex items-center gap-3 mb-2 text-xs text-white/50">
                      {movie.vote_average != null && movie.vote_average > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          {movie.vote_average.toFixed(1)}
                        </span>
                      )}
                      {movie.runtime_minutes != null && movie.runtime_minutes > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {movie.runtime_minutes}分
                        </span>
                      )}
                      {movie.match_score != null && (
                        <span className="text-yellow-400/70">マッチ度 {movie.match_score}%</span>
                      )}
                    </div>

                    {movie.reason && (
                      <p className="text-sm text-white/60 leading-relaxed mb-2">{movie.reason}</p>
                    )}

                    {movie.streaming_services.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {movie.streaming_services.map((s) => (
                          <StreamingBadge key={s} serviceName={s} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemove(movie.movie_id)}
                    className="opacity-0 group-hover:opacity-100 self-start p-1.5 text-white/30 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
