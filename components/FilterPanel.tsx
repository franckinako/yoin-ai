"use client";

import { Tv } from "lucide-react";
import { UserPreferences } from "@/lib/types";
import { STREAMING_SERVICE_NAMES } from "@/lib/streaming-providers";

interface FilterPanelProps {
  preferences: UserPreferences;
  onChange: (prefs: UserPreferences) => void;
  genres: { id: number; name: string }[];
}

export function FilterPanel({ preferences, onChange }: FilterPanelProps) {
  function toggleService(service: string) {
    const current = preferences.streamingServices;
    onChange({
      ...preferences,
      streamingServices: current.includes(service)
        ? current.filter((s) => s !== service)
        : [...current, service],
    });
  }

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col gap-4 p-4 rounded-2xl border border-white/10 bg-white/3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-white/50 text-xs font-medium tracking-widest uppercase">
        <Tv className="w-3.5 h-3.5" />
        契約サービス
      </div>
      <div className="flex flex-col gap-1.5">
        {STREAMING_SERVICE_NAMES.map((service) => {
          const active = preferences.streamingServices.includes(service);
          return (
            <button
              key={service}
              onClick={() => toggleService(service)}
              className={`text-sm px-3 py-2 rounded-lg border text-left transition-all ${
                active
                  ? "border-yellow-400/60 bg-yellow-400/10 text-white"
                  : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/60"
              }`}
            >
              {active && <span className="text-yellow-400 mr-1.5">✓</span>}
              {service}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-white/25 leading-relaxed">
        選択したサービスで視聴できる映画を優先して推薦します
      </p>
    </aside>
  );
}
