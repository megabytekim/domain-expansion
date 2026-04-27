"use client";

import { useState } from "react";
import type { CategoryFilter } from "@/lib/types";

const CATEGORY_CONFIG: { key: CategoryFilter; label: string; color: string; bg: string; border: string }[] = [
  { key: "trekking", label: "트레킹", color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)" },
  { key: "culture", label: "문화·역사", color: "#fbbf24", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.4)" },
  { key: "walking", label: "도보여행", color: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" },
  { key: "event", label: "기획상품", color: "#f472b6", bg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.4)" },
];

const MAX_PRICE = 30_000_000;
const MAX_DAYS = 45;

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  priceRange: [number, number];
  onPriceChange: (r: [number, number]) => void;
  durationRange: [number, number];
  onDurationChange: (r: [number, number]) => void;
  categories: Set<CategoryFilter>;
  onToggleCategory: (cat: CategoryFilter) => void;
  resultCount: number;
}

export default function SearchBar({
  searchQuery, onSearchChange,
  priceRange, onPriceChange,
  durationRange, onDurationChange,
  categories, onToggleCategory,
  resultCount,
}: SearchBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const hasActiveFilter =
    searchQuery.trim() !== "" ||
    priceRange[0] > 0 || priceRange[1] > 0 ||
    durationRange[0] > 0 || durationRange[1] > 0 ||
    categories.size < CATEGORY_CONFIG.length;

  const resetFilters = () => {
    onSearchChange("");
    onPriceChange([0, 0]);
    onDurationChange([0, 0]);
    setFilterOpen(false);
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5" style={{ maxWidth: "calc(100vw - 64px)" }}>
      {/* 검색창 + 필터 버튼 */}
      <div className="flex gap-1.5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm backdrop-blur-sm"
          style={{ background: "rgba(15,23,42,0.85)", border: "1px solid #334155", flex: 1, minWidth: 180 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="목적지 또는 상품명"
            className="bg-transparent outline-none text-gray-200 placeholder-gray-500 w-full text-xs"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange("")} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          )}
        </div>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className="px-3 py-1.5 rounded-full text-xs backdrop-blur-sm transition-all"
          style={{
            background: hasActiveFilter ? "rgba(96,165,250,0.2)" : "rgba(15,23,42,0.85)",
            color: hasActiveFilter ? "#60a5fa" : "#94a3b8",
            border: `1px solid ${hasActiveFilter ? "rgba(96,165,250,0.5)" : "#334155"}`,
          }}
        >
          필터 {hasActiveFilter && "●"}
        </button>
      </div>

      {/* 카테고리 칩 */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_CONFIG.map(({ key, label, color, bg, border }) => {
          const active = categories.has(key);
          return (
            <button
              key={key}
              onClick={() => onToggleCategory(key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all backdrop-blur-sm"
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
        <span className="px-2 py-1 text-xs text-gray-500">{resultCount}개</span>
      </div>

      {/* 필터 드롭다운 */}
      {filterOpen && (
        <div
          className="rounded-xl p-4 flex flex-col gap-4 backdrop-blur-sm"
          style={{ background: "rgba(15,23,42,0.95)", border: "1px solid #334155", minWidth: 240 }}
        >
          {/* 가격 */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>가격</span>
              <span>
                {priceRange[0] > 0 ? `₩${(priceRange[0] / 10000).toFixed(0)}만` : "최소"}
                {" — "}
                {priceRange[1] > 0 ? `₩${(priceRange[1] / 10000).toFixed(0)}만` : "최대"}
              </span>
            </div>
            <div className="flex gap-2">
              <input type="range" min={0} max={MAX_PRICE} step={500_000}
                value={priceRange[0]}
                onChange={(e) => onPriceChange([+e.target.value, priceRange[1]])}
                className="flex-1 accent-blue-400" />
              <input type="range" min={0} max={MAX_PRICE} step={500_000}
                value={priceRange[1] || MAX_PRICE}
                onChange={(e) => {
                  const v = +e.target.value;
                  onPriceChange([priceRange[0], v === MAX_PRICE ? 0 : v]);
                }}
                className="flex-1 accent-blue-400" />
            </div>
          </div>

          {/* 기간 */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>기간</span>
              <span>
                {durationRange[0] > 0 ? `${durationRange[0]}일` : "최소"}
                {" — "}
                {durationRange[1] > 0 ? `${durationRange[1]}일` : "최대"}
              </span>
            </div>
            <div className="flex gap-2">
              <input type="range" min={1} max={MAX_DAYS}
                value={durationRange[0] || 1}
                onChange={(e) => {
                  const v = +e.target.value;
                  onDurationChange([v === 1 ? 0 : v, durationRange[1]]);
                }}
                className="flex-1 accent-blue-400" />
              <input type="range" min={1} max={MAX_DAYS}
                value={durationRange[1] || MAX_DAYS}
                onChange={(e) => {
                  const v = +e.target.value;
                  onDurationChange([durationRange[0], v === MAX_DAYS ? 0 : v]);
                }}
                className="flex-1 accent-blue-400" />
            </div>
          </div>

          {hasActiveFilter && (
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-200 text-center">
              필터 초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}
