# Hyecho Map Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 혜초 지도에 다중 상품 목록 탐색, 검색/필터, 상품 상세 강화, 지도 hover 툴팁을 추가한다.

**Architecture:** `page.tsx`의 상태를 `selectedLocation`(위치+상품목록) + `selectedProductId`(선택된 상품) 두 단계로 분리하고, 검색/필터 상태를 추가한다. UnescoMap은 `filteredProductIds`와 `selectedProductId`를 받아 opacity paint expression으로 마커를 강조/흐리게 처리한다. 모든 GeoJSON은 변하지 않고, 가시성은 `source.setData()`로 `_opacity` 속성을 재계산해 반영한다.

**Tech Stack:** Next.js 16 (App Router, output: export), React 19, MapLibre GL JS, TypeScript, Tailwind CSS

---

## 파일 구조

| 파일 | 변경 |
|------|------|
| `lib/types.ts` | `SelectedLocation` 타입 추가, `HyechoMapProps` 업데이트 |
| `lib/merge-data.ts` | `parsePrice`, `parseDuration`, `filterProducts`, `buildLocationMap` 추가 |
| `components/SearchBar.tsx` | **신규** — 검색창 + 필터 드롭다운 + 카테고리 칩 |
| `components/ProductList.tsx` | **신규** — 위치 내 상품 목록 |
| `components/SiteDetail.tsx` | 수정 — `HyechoProduct` 직접 수신, 뒤로가기, 도시 태그 |
| `components/UnescoMap.tsx` | 수정 — opacity 로직, hover 툴팁, props 변경 |
| `app/page.tsx` | 수정 — 상태 재설계 |
| `components/FilterBar.tsx` | **삭제** |

---

## Task 1: 데이터 레이어 (`lib/merge-data.ts` + `lib/types.ts`)

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/merge-data.ts`

- [ ] **Step 1: `lib/types.ts`에 `SelectedLocation` 추가**

```typescript
// lib/types.ts — 기존 내용 유지하고 아래 추가

export interface SelectedLocation {
  lat: number;
  lng: number;
  products: HyechoProduct[];
}
```

- [ ] **Step 2: `lib/merge-data.ts`에 헬퍼 함수 추가**

기존 `productsToGeoJSON` 아래에 추가:

```typescript
/** "9,200,000" → 9200000, 파싱 실패 시 0 */
export function parsePrice(price: string): number {
  const n = parseInt(price.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

/** "9일" → 9, "13일" → 13, 파싱 실패 시 0 */
export function parseDuration(duration: string): number {
  const m = duration.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** lat,lng 소수점 4자리 반올림 키 (부동소수점 오차 방지) */
export function locKey(lat: number, lng: number): string {
  return `${Math.round(lat * 10000) / 10000},${Math.round(lng * 10000) / 10000}`;
}

/** 좌표 키 → 해당 위치에 연결된 상품 배열 */
export function buildLocationMap(products: HyechoProduct[]): Map<string, HyechoProduct[]> {
  const map = new Map<string, HyechoProduct[]>();
  for (const product of products) {
    for (const loc of product.locations) {
      const key = locKey(loc.lat, loc.lng);
      const existing = map.get(key) ?? [];
      if (!existing.includes(product)) existing.push(product);
      map.set(key, existing);
    }
  }
  return map;
}

export interface FilterOptions {
  categories: Set<string>;
  searchQuery: string;
  priceRange: [number, number]; // [min, max], 0이면 무제한
  durationRange: [number, number]; // [min, max], 0이면 무제한
}

/** 필터 조건을 통과하는 상품 ID Set 반환 */
export function filterProducts(
  products: HyechoProduct[],
  opts: FilterOptions
): Set<string> {
  const result = new Set<string>();
  for (const p of products) {
    // 카테고리
    if (!opts.categories.has(p.category)) continue;
    // 검색어 (제목 + 위치명)
    if (opts.searchQuery.trim()) {
      const q = opts.searchQuery.toLowerCase();
      const inTitle = p.title.toLowerCase().includes(q);
      const inLoc = p.locations.some((l) => l.name.toLowerCase().includes(q));
      if (!inTitle && !inLoc) continue;
    }
    // 가격
    const price = parsePrice(p.price);
    if (opts.priceRange[0] > 0 && price < opts.priceRange[0]) continue;
    if (opts.priceRange[1] > 0 && price > opts.priceRange[1]) continue;
    // 기간
    const days = parseDuration(p.duration);
    if (opts.durationRange[0] > 0 && days < opts.durationRange[0]) continue;
    if (opts.durationRange[1] > 0 && days > opts.durationRange[1]) continue;

    result.add(p.id);
  }
  return result;
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/newyork/domain-expansion/unesco
npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully` — 타입 에러 없어야 함.

- [ ] **Step 4: 커밋**

```bash
git add lib/types.ts lib/merge-data.ts
git commit -m "feat: add parsePrice, parseDuration, filterProducts, buildLocationMap"
```

---

## Task 2: SearchBar 컴포넌트 (신규)

**Files:**
- Create: `components/SearchBar.tsx`
- Delete: `components/FilterBar.tsx` (이 태스크 마지막에)

- [ ] **Step 1: `components/SearchBar.tsx` 생성**

```typescript
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
  resultCount: number; // 현재 필터 통과 상품 수
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
    durationRange[0] > 0 || durationRange[1] > 0;

  const resetFilters = () => {
    onSearchChange("");
    onPriceChange([0, 0]);
    onDurationChange([0, 0]);
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
        {/* 결과 수 */}
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
                onChange={(e) => onDurationChange([+e.target.value, durationRange[1]])}
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
```

- [ ] **Step 2: `FilterBar.tsx` 삭제**

```bash
rm /Users/newyork/domain-expansion/unesco/components/FilterBar.tsx
```

- [ ] **Step 3: 빌드 확인 (FilterBar import 에러 예상됨 — 다음 태스크에서 수정)**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: FilterBar import 관련 에러만 나야 함.

- [ ] **Step 4: 커밋**

```bash
git add components/SearchBar.tsx
git rm components/FilterBar.tsx
git commit -m "feat: add SearchBar, remove FilterBar"
```

---

## Task 3: ProductList 컴포넌트 (신규)

**Files:**
- Create: `components/ProductList.tsx`

- [ ] **Step 1: `components/ProductList.tsx` 생성**

```typescript
"use client";

import type { HyechoProduct, SelectedLocation } from "@/lib/types";

interface ProductListProps {
  location: SelectedLocation;
  onSelectProduct: (productId: string) => void;
}

export default function ProductList({ location, onSelectProduct }: ProductListProps) {
  // 이 위치에 연결된 도시명 (products[].locations 중 이 좌표와 일치하는 것)
  const locationName = (() => {
    for (const p of location.products) {
      const match = p.locations.find(
        (l) =>
          Math.abs(l.lat - location.lat) < 0.001 &&
          Math.abs(l.lng - location.lng) < 0.001
      );
      if (match) return match.name;
    }
    return "";
  })();

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 pb-1">
        {locationName && `${locationName} · `}{location.products.length}개 상품
      </p>
      {location.products.map((product) => (
        <button
          key={product.id}
          onClick={() => onSelectProduct(product.id)}
          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
          style={{ background: "rgba(15,23,42,0.8)" }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug">
              {product.title}
            </p>
            <div className="flex gap-3 mt-1">
              {product.price && (
                <span className="text-xs text-emerald-400">₩{product.price}</span>
              )}
              {product.duration && (
                <span className="text-xs text-gray-500">{product.duration}</span>
              )}
            </div>
          </div>
          <span className="text-gray-600 flex-shrink-0">›</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: FilterBar import 에러만 남아있어야 함 (ProductList 자체 에러 없어야).

- [ ] **Step 3: 커밋**

```bash
git add components/ProductList.tsx
git commit -m "feat: add ProductList component"
```

---

## Task 4: SiteDetail 수정

**Files:**
- Modify: `components/SiteDetail.tsx`

- [ ] **Step 1: `SiteDetail.tsx` 전체 교체**

`HyechoProduct`를 직접 받도록 변경. 뒤로가기 + 도시 태그 추가.

```typescript
import type { HyechoProduct } from "@/lib/types";

interface SiteDetailProps {
  product: HyechoProduct;
  locationCount: number; // 1이면 뒤로가기 숨김
  onBack: () => void;
}

export default function SiteDetail({ product, locationCount, onBack }: SiteDetailProps) {
  return (
    <div className="space-y-3">
      {/* 뒤로가기 */}
      {locationCount > 1 && (
        <button
          onClick={onBack}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          ← 목록으로
        </button>
      )}

      {/* 상품 이미지 */}
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-full h-40 object-cover rounded-lg"
          loading="lazy"
        />
      )}

      {/* 제목 */}
      <h2 className="text-lg font-bold text-white leading-snug">{product.title}</h2>

      {/* 가격 + 기간 */}
      <div className="flex gap-4 text-sm">
        {product.price && (
          <span className="text-emerald-400 font-medium">₩{product.price}</span>
        )}
        {product.duration && (
          <span className="text-gray-400">{product.duration}</span>
        )}
      </div>

      {/* 경유 도시 태그 */}
      {product.locations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {product.locations.map((loc) => (
            <span
              key={`${loc.lat}-${loc.lng}`}
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ background: "rgba(30,58,138,0.5)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.3)" }}
            >
              {loc.name}
            </span>
          ))}
        </div>
      )}

      {/* 혜초 링크 */}
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-medium rounded-lg transition-colors"
      >
        혜초여행에서 보기 →
      </a>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 3: 커밋**

```bash
git add components/SiteDetail.tsx
git commit -m "feat: update SiteDetail to use HyechoProduct directly, add city tags and back button"
```

---

## Task 5: UnescoMap 수정

**Files:**
- Modify: `components/UnescoMap.tsx`

- [ ] **Step 1: `UnescoMap.tsx` 전체 교체**

```typescript
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { MarkerGeoJSON, SelectedLocation } from "@/lib/types";
import type { HyechoProduct } from "@/lib/types";
import { locKey } from "@/lib/merge-data";

const PALETTE = [
  "#ff6b6b","#ffa94d","#ffd43b","#a9e34b","#51cf66",
  "#20c997","#22b8cf","#339af0","#5c7cfa","#7950f2",
  "#be4bdb","#e64980","#ff8787","#ffc078","#ffe066",
  "#c0eb75","#69db7c","#38d9a9","#3bc9db","#4dabf7",
  "#748ffc","#9775fa","#cc5de8","#f06595","#fa5252",
  "#fd7e14","#fab005","#82c91e","#40c057","#12b886",
  "#15aabf","#228be6","#4c6ef5","#7048e8","#ae3ec9",
  "#d6336c","#e03131","#e8590c","#f08c00","#66a80f",
  "#2b8a3e","#0b7285","#1864ab","#364fc7","#5f3dc4",
  "#862e9c","#a61e4d","#c92a2a","#d9480f","#e67700",
];

interface HyechoMapProps {
  data: MarkerGeoJSON;
  filteredProductIds: Set<string>;
  selectedProductId: string | null;
  locationMap: Map<string, HyechoProduct[]>;
  onLocationSelect: (loc: SelectedLocation | null) => void;
}

export default function HyechoMap({
  data,
  filteredProductIds,
  selectedProductId,
  locationMap,
  onLocationSelect,
}: HyechoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onLocationSelect);
  const locationMapRef = useRef(locationMap);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => { onSelectRef.current = onLocationSelect; }, [onLocationSelect]);
  useEffect(() => { locationMapRef.current = locationMap; }, [locationMap]);

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${key}`,
      center: [30, 25],
      zoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("hyecho", {
        type: "geojson",
        data: data as unknown as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: "markers",
        type: "circle",
        source: "hyecho",
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "match",
            ["%", ["get", "colorIndex"], PALETTE.length],
            ...PALETTE.flatMap((c, i) => [i, c]),
            "#888",
          ] as unknown as maplibregl.ExpressionSpecification,
          "circle-stroke-width": ["case", ["get", "_selected"], 2.5, 1.5],
          "circle-stroke-color": ["case", ["get", "_selected"], "#ffffff", "rgba(255,255,255,0.4)"],
          "circle-opacity": ["coalesce", ["get", "_opacity"], 0.9],
        },
      });

      // 마커 클릭
      map.on("click", "markers", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        const [lng, lat] = coords;
        const key = locKey(lat, lng);
        const products = locationMapRef.current.get(key) ?? [];
        onSelectRef.current({ lat, lng, products });
      });

      // 빈 영역 클릭 → 선택 해제
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["markers"] });
        if (features.length === 0) onSelectRef.current(null);
      });

      // 커서
      map.on("mouseenter", "markers", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "markers", () => { map.getCanvas().style.cursor = ""; });

      // Hover 툴팁
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -14],
        className: "hyecho-tooltip",
      });
      popupRef.current = popup;

      map.on("mousemove", "markers", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const title = feature.properties?.productTitle ?? "";
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<span style="font-size:12px;color:#e2e8f0;white-space:nowrap;max-width:200px;display:block;overflow:hidden;text-overflow:ellipsis">${title}</span>`)
          .addTo(map);
      });

      map.on("mouseleave", "markers", () => {
        popup.remove();
      });
    });

    mapRef.current = map;
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 필터/선택 상태 → 마커 opacity 업데이트
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("hyecho") as maplibregl.GeoJSONSource;
      if (!source) return;

      const isFiltering = filteredProductIds.size < data.features.length;

      const features = data.features.map((f) => {
        const id = f.properties.productId;
        const isFiltered = filteredProductIds.has(id);
        const isSelected = selectedProductId === id;

        let opacity = 0.9;
        if (selectedProductId) {
          opacity = isSelected ? 1.0 : 0.2;
        } else if (isFiltering) {
          opacity = isFiltered ? 0.9 : 0.2;
        }

        return {
          ...f,
          properties: {
            ...f.properties,
            _opacity: opacity,
            _selected: isSelected,
          },
        };
      });

      source.setData({
        type: "FeatureCollection",
        features,
      } as unknown as GeoJSON.FeatureCollection);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [data, filteredProductIds, selectedProductId]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
```

- [ ] **Step 2: 툴팁 스타일 추가**

`app/globals.css`에 추가:

```css
.hyecho-tooltip .maplibregl-popup-content {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 5px 9px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.hyecho-tooltip .maplibregl-popup-tip {
  display: none;
}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 4: 커밋**

```bash
git add components/UnescoMap.tsx app/globals.css
git commit -m "feat: add opacity logic, hover tooltip, new props to UnescoMap"
```

---

## Task 6: `page.tsx` — 상태 재설계 + 조합

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: `app/page.tsx` 전체 교체**

```typescript
"use client";

import { useState, useCallback, useMemo } from "react";
import HyechoMap from "@/components/UnescoMap";
import BottomSheet from "@/components/BottomSheet";
import SiteDetail from "@/components/SiteDetail";
import ProductList from "@/components/ProductList";
import SearchBar from "@/components/SearchBar";
import { productsToGeoJSON, buildLocationMap, filterProducts } from "@/lib/merge-data";
import type { HyechoProduct, SelectedLocation, CategoryFilter } from "@/lib/types";
import rawProducts from "@/data/hyecho-packages.json";

const products = rawProducts as unknown as HyechoProduct[];
const geoData = productsToGeoJSON(products);
const locationMap = buildLocationMap(products);

export default function Home() {
  // 선택 상태
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<"closed" | "half" | "full">("closed");

  // 필터 상태
  const [categories, setCategories] = useState<Set<CategoryFilter>>(
    new Set(["trekking", "culture", "walking", "event"])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
  const [durationRange, setDurationRange] = useState<[number, number]>([0, 0]);

  // 필터 통과 상품 ID
  const filteredProductIds = useMemo(
    () => filterProducts(products, { categories, searchQuery, priceRange, durationRange }),
    [categories, searchQuery, priceRange, durationRange]
  );

  const handleLocationSelect = useCallback((loc: SelectedLocation | null) => {
    if (!loc) {
      setSelectedLocation(null);
      setSelectedProductId(null);
      setSheetState("closed");
      return;
    }
    setSelectedLocation(loc);
    // 상품이 하나면 바로 상세
    if (loc.products.length === 1) {
      setSelectedProductId(loc.products[0].id);
    } else {
      setSelectedProductId(null);
    }
    setSheetState("half");
  }, []);

  const handleBack = useCallback(() => {
    setSelectedProductId(null);
  }, []);

  const handleToggleCategory = useCallback((cat: CategoryFilter) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const selectedProduct = selectedProductId
    ? products.find((p) => p.id === selectedProductId) ?? null
    : null;

  return (
    <div className={`relative h-full w-full ${sheetState !== "closed" ? "sheet-open" : ""}`}>
      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
        durationRange={durationRange}
        onDurationChange={setDurationRange}
        categories={categories}
        onToggleCategory={handleToggleCategory}
        resultCount={filteredProductIds.size}
      />
      <HyechoMap
        data={geoData}
        filteredProductIds={filteredProductIds}
        selectedProductId={selectedProductId}
        locationMap={locationMap}
        onLocationSelect={handleLocationSelect}
      />
      <BottomSheet state={sheetState} onStateChange={setSheetState}>
        {selectedProduct ? (
          <SiteDetail
            product={selectedProduct}
            locationCount={selectedLocation?.products.length ?? 1}
            onBack={handleBack}
          />
        ) : selectedLocation ? (
          <ProductList
            location={selectedLocation}
            onSelectProduct={setSelectedProductId}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인 — 에러 없어야 함**

```bash
npm run build 2>&1 | tail -15
```

Expected:
```
✓ Compiled successfully
Route (app)
┌ ○ /
└ ○ /_not-found
○  (Static)  prerendered as static content
```

- [ ] **Step 3: dev 서버로 동작 확인**

```bash
npm run dev &
```

확인 항목:
1. 지도 로드 — 마커 표시
2. 마커 hover — 툴팁 나타남
3. 마커 클릭 (여러 상품 위치) — 바텀시트에 목록 표시
4. 목록에서 상품 클릭 — 상세 표시, 도시 태그 표시
5. "← 목록으로" 클릭 — 목록으로 돌아감
6. 검색창에 "네팔" 입력 — 관련 마커만 밝게, 나머지 흐리게
7. 필터 버튼 — 가격/기간 슬라이더 드롭다운
8. 상품 하나뿐인 마커 클릭 — 바로 상세 표시

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: redesign state, wire up SearchBar, ProductList, SiteDetail"
```

---

## Task 7: Vercel 배포

**Files:** 없음 (CLI 명령만)

- [ ] **Step 1: 프로덕션 빌드 최종 확인**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 2: Vercel 배포**

```bash
vercel --prod 2>&1 | tail -5
```

- [ ] **Step 3: 배포된 URL에서 동작 확인**

Task 6 Step 3의 확인 항목을 배포 URL에서도 반복.

---

## Self-Review 결과

**Spec coverage 확인:**
- ✅ 같은 위치 다중 상품 목록 → Task 3 ProductList + Task 6 handleLocationSelect
- ✅ 상품 하나면 바로 상세 → Task 6 handleLocationSelect 분기
- ✅ 뒤로가기 → Task 4 SiteDetail + Task 6 handleBack
- ✅ 검색 (제목 + 위치명) → Task 1 filterProducts
- ✅ 가격/기간 슬라이더 → Task 2 SearchBar
- ✅ 비매칭 마커 흐리게 → Task 5 opacity useEffect
- ✅ 선택된 상품 마커 강조 → Task 5 `_selected` + stroke paint
- ✅ 경유 도시 태그 → Task 4 SiteDetail
- ✅ Hover 툴팁 → Task 5 mousemove/mouseleave
- ✅ FilterBar 삭제 → Task 2
- ✅ 카테고리 칩 SearchBar로 이동 → Task 2

**타입 일관성:**
- `locKey()` — Task 1에서 정의, Task 5에서 import ✅
- `SelectedLocation` — Task 1에서 정의, Task 3/4/5/6에서 사용 ✅
- `filteredProductIds: Set<string>` — Task 1 filterProducts 반환값, Task 5/6 props ✅
- `locationMap: Map<string, HyechoProduct[]>` — Task 1 buildLocationMap 반환값, Task 5/6 props ✅
