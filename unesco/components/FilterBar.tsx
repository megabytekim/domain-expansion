"use client";

import type { CategoryFilter } from "@/lib/types";

interface FilterBarProps {
  categories: Set<CategoryFilter>;
  onToggleCategory: (cat: CategoryFilter) => void;
  hyechoOnly: boolean;
  onToggleHyecho: () => void;
}

const CATEGORY_CONFIG: { key: CategoryFilter; label: string; color: string; bg: string; border: string }[] = [
  { key: "Cultural", label: "Cultural", color: "#ff6b35", bg: "rgba(255,107,53,0.15)", border: "rgba(255,107,53,0.4)" },
  { key: "Natural", label: "Natural", color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)" },
  { key: "Mixed", label: "Mixed", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)" },
];

export default function FilterBar({ categories, onToggleCategory, hyechoOnly, onToggleHyecho }: FilterBarProps) {
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
      <button
        onClick={onToggleHyecho}
        className="px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm"
        style={{
          backgroundColor: hyechoOnly ? "rgba(251,191,36,0.15)" : "rgba(0,0,0,0.5)",
          color: hyechoOnly ? "#fbbf24" : "#666",
          border: `1px solid ${hyechoOnly ? "rgba(251,191,36,0.4)" : "#333"}`,
        }}
      >
        혜초 ✓
      </button>
    </div>
  );
}
