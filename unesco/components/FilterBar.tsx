"use client";

import type { CategoryFilter } from "@/lib/types";

interface FilterBarProps {
  categories: Set<CategoryFilter>;
  onToggleCategory: (cat: CategoryFilter) => void;
}

const CATEGORY_CONFIG: { key: CategoryFilter; label: string; color: string; bg: string; border: string }[] = [
  { key: "trekking", label: "트레킹", color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)" },
  { key: "culture", label: "문화·역사", color: "#fbbf24", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.4)" },
  { key: "walking", label: "도보여행", color: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" },
];

export default function FilterBar({ categories, onToggleCategory }: FilterBarProps) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
      {CATEGORY_CONFIG.map(({ key, label, color, bg, border }) => {
        const active = categories.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggleCategory(key)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm"
            style={{
              backgroundColor: active ? bg : "rgba(0,0,0,0.5)",
              color: active ? color : "#666",
              border: `1px solid ${active ? border : "#333"}`,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
