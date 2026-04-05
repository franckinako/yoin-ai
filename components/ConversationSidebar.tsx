"use client";

import { useEffect, useState } from "react";
import { SquarePen, MessageSquare, Trash2, X } from "lucide-react";
import { listConversations, deleteConversation, ConversationSummary } from "@/lib/conversations";
import { useAuthStore } from "@/lib/store/authStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ConversationSidebar({
  currentConversationId,
  onSelect,
  onNew,
  mobileOpen,
  onMobileClose,
}: ConversationSidebarProps) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    if (!user) { setConversations([]); return; }
    listConversations().then(setConversations);
  }, [user, currentConversationId]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) onNew();
  }

  if (!user || !isSupabaseConfigured()) return null;

  const inner = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/8">
        <span className="text-xs font-medium text-white/40 tracking-wider uppercase">履歴</span>
        <button
          onClick={() => { onNew(); onMobileClose(); }}
          className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/8 transition-all"
          title="新しい会話"
        >
          <SquarePen className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-1.5">
        {conversations.length === 0 ? (
          <p className="text-xs text-white/20 text-center py-8">履歴はありません</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c.id); onMobileClose(); }}
              className={`group w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all mb-0.5 ${
                currentConversationId === c.id
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:bg-white/6 hover:text-white/80"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
              <span className="flex-1 truncate text-xs">{c.title}</span>
              <button
                onClick={(e) => handleDelete(e, c.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-white/25 hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <aside className="hidden md:flex flex-col w-56 bg-[#0d0d14] border-r border-white/8 flex-shrink-0">
        {inner}
      </aside>

      {/* Mobile: overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={onMobileClose}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-64 z-50 bg-[#0d0d14] border-r border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-bold text-white">🎬 YO-IN AI</span>
              <button onClick={onMobileClose} className="p-1 text-white/40 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {inner}
          </aside>
        </>
      )}
    </>
  );
}
