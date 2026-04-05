"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Trash2, ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import { listConversations, deleteConversation, ConversationSummary } from "@/lib/conversations";
import { useAuthStore } from "@/lib/store/authStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationSidebar({ currentConversationId, onSelect, onNew }: ConversationSidebarProps) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      return;
    }
    listConversations().then(setConversations);
  }, [user, currentConversationId]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) onNew();
  }

  if (!user || !isSupabaseConfigured()) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-30 w-5 h-12 bg-white/10 hover:bg-white/20 border border-white/15 border-l-0 rounded-r-lg flex items-center justify-center transition-all"
      >
        {open ? <ChevronLeft className="w-3 h-3 text-white/50" /> : <ChevronRight className="w-3 h-3 text-white/50" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 w-60 z-20 bg-[#0d0d14] border-r border-white/10 flex flex-col pt-[72px]"
          >
            <div className="px-3 py-2 border-b border-white/10">
              <button
                onClick={() => { onNew(); setOpen(false); }}
                className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-yellow-400/30 text-yellow-400/80 hover:bg-yellow-400/10 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                新しい会話
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2 px-2">
              {conversations.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6">会話履歴はありません</p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { onSelect(c.id); setOpen(false); }}
                    className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-all mb-1 ${
                      currentConversationId === c.id
                        ? "bg-yellow-400/15 text-white border border-yellow-400/20"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    <span className="flex-1 truncate text-xs">{c.title}</span>
                    <button
                      onClick={(e) => handleDelete(e, c.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-white/30 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 bg-black/40 backdrop-blur-[1px]"
          />
        )}
      </AnimatePresence>
    </>
  );
}
