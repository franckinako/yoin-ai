"use client";

import { Badge } from "@/components/ui/badge";

interface StreamingBadgeProps {
  serviceName: string;
}

const SERVICE_COLORS: Record<string, string> = {
  Netflix: "bg-red-600 text-white",
  "Amazon Prime Video": "bg-blue-500 text-white",
  "Disney+": "bg-blue-800 text-white",
  Hulu: "bg-green-500 text-white",
  "Apple TV+": "bg-gray-800 text-white",
  "U-NEXT": "bg-purple-600 text-white",
};

export function StreamingBadge({ serviceName }: StreamingBadgeProps) {
  const colorClass = SERVICE_COLORS[serviceName] ?? "bg-gray-600 text-white";
  return (
    <Badge className={`text-xs px-2 py-0.5 ${colorClass} border-0`}>
      {serviceName}
    </Badge>
  );
}
