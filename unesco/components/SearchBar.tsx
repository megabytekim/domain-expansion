"use client";

import { useState } from "react";
import type { CategoryFilter, HyechoProduct } from "@/lib/types";

// Pilgrim Manuscript: 마커 sepia 4색과 동일
const CATEGORY_CONFIG: { key: CategoryFilter; label: string; color: string; bg: string; border: string }[] = [
  { key: "trekking", label: "트레킹",   color: "#7a9aa3", bg: "rgba(122,154,163,0.16)", border: "rgba(122,154,163,0.45)" },
  { key: "culture",  label: "문화·역사", color: "#c47a3b", bg: "rgba(196,122,59,0.16)",  border: "rgba(196,122,59,0.45)" },
  { key: "walking",  label: "도보여행",  color: "#5f8d76", bg: "rgba(95,141,118,0.16)", border: "rgba(95,141,118,0.45)" },
  { key: "event",    label: "기획상품",  color: "#b85450", bg: "rgba(184,84,80,0.16)",  border: "rgba(184,84,80,0.45)" },
];

function formatPriceRange(a: number, b: number, dataMin: number, dataMax: number): string {
  const fmt = (v: number) => `${Math.round(v / 10000)}만`;
  // 둘 다 미설정: 데이터 범위 그대로 노출 (정보 전달)
  if (a === 0 && b === 0) return `₩${fmt(dataMin)} ─ ${fmt(dataMax)}`;
  if (a > 0 && b > 0) return `₩${fmt(a)} ─ ${fmt(b)}`;
  if (a > 0) return `₩${fmt(a)} 이상`;
  return `${fmt(b)} 이하`;
}

function formatDurationRange(a: number, b: number, dataMin: number, dataMax: number): string {
  if (a === 0 && b === 0) return `${dataMin} ─ ${dataMax}일`;
  if (a > 0 && b > 0) return `${a} ─ ${b}일`;
  if (a > 0) return `${a}일 이상`;
  return `${b}일 이하`;
}

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  priceRange: [number, number];
  onPriceChange: (r: [number, number]) => void;
  durationRange: [number, number];
  onDurationChange: (r: [number, number]) => void;
  priceMin: number;
  priceMax: number;
  priceStep: number;
  durationMin: number;
  durationMax: number;
  categories: Set<CategoryFilter>;
  onToggleCategory: (cat: CategoryFilter) => void;
  resultCount: number;
  searchMatches: HyechoProduct[];
  onSelectMatch: (id: string) => void;
}

export default function SearchBar({
  searchQuery, onSearchChange,
  priceRange, onPriceChange,
  durationRange, onDurationChange,
  priceMin, priceMax, priceStep, durationMin, durationMax,
  categories, onToggleCategory,
  resultCount,
  searchMatches, onSelectMatch,
}: SearchBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const hasActiveFilter =
    searchQuery.trim() !== "" ||
    priceRange[0] > 0 || priceRange[1] > 0 ||
    durationRange[0] > 0 || durationRange[1] > 0;

  const resetFilters = () => {
    onSearchChange("");
    onPriceChange([0, 0]);
    onDurationChange([0, 0]);
    setFilterOpen(false);
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 max-w-[calc(100vw-110px)] md:max-w-[calc(100vw-64px)]">
      {/* 검색창 + 필터 버튼 */}
      <div className="flex gap-1.5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm backdrop-blur-sm"
          style={{ background: "rgba(20,19,28,0.88)", border: "1px solid rgba(244,236,216,0.12)", flex: 1, minWidth: 180 }}>
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
            background: hasActiveFilter ? "rgba(96,165,250,0.2)" : "rgba(20,19,28,0.88)",
            color: hasActiveFilter ? "#60a5fa" : "#94a3b8",
            border: `1px solid ${hasActiveFilter ? "rgba(96,165,250,0.5)" : "#334155"}`,
          }}
        >
          필터 {hasActiveFilter && "●"}
        </button>
      </div>

      {/* 검색 결과 드롭다운 */}
      {searchQuery.trim() && searchMatches.length > 0 && (
        <div
          className="rounded-xl overflow-hidden backdrop-blur-sm"
          style={{ background: "rgba(20,19,28,0.95)", border: "1px solid rgba(244,236,216,0.12)" }}
        >
          {searchMatches.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectMatch(p.id)}
              className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-gray-800 last:border-0"
            >
              <p className="text-xs text-gray-200 leading-tight line-clamp-2">{p.title}</p>
              {p.locations.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">{p.locations.map((l) => l.name).join(" · ")}</p>
              )}
            </button>
          ))}
        </div>
      )}
      {searchQuery.trim() && searchMatches.length === 0 && (
        <div
          className="px-3 py-2 rounded-xl text-xs text-gray-500 backdrop-blur-sm"
          style={{ background: "rgba(20,19,28,0.95)", border: "1px solid rgba(244,236,216,0.12)" }}
        >
          검색 결과 없음
        </div>
      )}

      {/* 카테고리 칩 */}
      <div className="flex flex-wrap gap-1 md:gap-1.5 items-center">
        {CATEGORY_CONFIG.map(({ key, label, color, bg, border }) => {
          const active = categories.has(key);
          return (
            <button
              key={key}
              onClick={() => onToggleCategory(key)}
              className="px-2 md:px-3 py-1 rounded-full text-xs font-medium transition-all backdrop-blur-sm"
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
        <span className="px-1 md:px-2 py-1 text-xs text-gray-500">{resultCount}개</span>
      </div>

      {/* 필터 드롭다운 */}
      {filterOpen && (
        <div
          className="rounded-xl p-4 flex flex-col gap-4 backdrop-blur-sm"
          style={{ background: "rgba(20,19,28,0.95)", border: "1px solid rgba(244,236,216,0.12)", minWidth: 240 }}
        >
          {/* 가격 */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>가격</span>
              <span>{formatPriceRange(priceRange[0], priceRange[1], priceMin, priceMax)}</span>
            </div>
            <div className="flex gap-2">
              <input type="range" min={0} max={priceMax} step={priceStep}
                value={priceRange[0]}
                onChange={(e) => onPriceChange([+e.target.value, priceRange[1]])}
                className="flex-1 accent-blue-400" />
              <input type="range" min={0} max={priceMax} step={priceStep}
                value={priceRange[1] || priceMax}
                onChange={(e) => {
                  const v = +e.target.value;
                  onPriceChange([priceRange[0], v === priceMax ? 0 : v]);
                }}
                className="flex-1 accent-blue-400" />
            </div>
          </div>

          {/* 기간 */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>기간</span>
              <span>{formatDurationRange(durationRange[0], durationRange[1], durationMin, durationMax)}</span>
            </div>
            <div className="flex gap-2">
              <input type="range" min={1} max={durationMax}
                value={durationRange[0] || 1}
                onChange={(e) => {
                  const v = +e.target.value;
                  onDurationChange([v === 1 ? 0 : v, durationRange[1]]);
                }}
                className="flex-1 accent-blue-400" />
              <input type="range" min={1} max={durationMax}
                value={durationRange[1] || durationMax}
                onChange={(e) => {
                  const v = +e.target.value;
                  onDurationChange([durationRange[0], v === durationMax ? 0 : v]);
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
