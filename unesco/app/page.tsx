"use client";

import { useState, useCallback, useMemo } from "react";
import HyechoMap from "@/components/UnescoMap";
import BottomSheet from "@/components/BottomSheet";
import SiteDetail from "@/components/SiteDetail";
import ProductList from "@/components/ProductList";
import SearchBar from "@/components/SearchBar";
import RankingPanel from "@/components/RankingPanel";
import ChatWidget from "@/components/ChatWidget";
import { productsToGeoJSON, buildLocationMap, filterProducts, buildMultiLocationGeoJSON, parsePrice, parseDuration } from "@/lib/merge-data";
import type { HyechoProduct, SelectedLocation, CategoryFilter } from "@/lib/types";
import rawProducts from "@/data/hyecho-packages.json";

const products = rawProducts as unknown as HyechoProduct[];
const geoData = productsToGeoJSON(products);
const locationMap = buildLocationMap(products);
const multiGeoJSON = buildMultiLocationGeoJSON(locationMap);

const PRICE_STEP = 500_000;
const _prices = products.map((p) => parsePrice(p.price)).filter((v) => v > 0);
const _durations = products.map((p) => parseDuration(p.duration)).filter((v) => v > 0);
const priceMin = _prices.length ? Math.floor(Math.min(..._prices) / PRICE_STEP) * PRICE_STEP : 0;
const priceMax = _prices.length ? Math.ceil(Math.max(..._prices) / PRICE_STEP) * PRICE_STEP : PRICE_STEP;
const durationMin = _durations.length ? Math.min(..._durations) : 1;
const durationMax = _durations.length ? Math.max(..._durations) : 1;

const dataDateLabel = (() => {
  const iso = products[0]?.departuresUpdatedAt;
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
})();

function getSearchMatches(
  products: HyechoProduct[],
  query: string,
  filteredIds: Set<string>
): HyechoProduct[] {
  if (!query.trim()) return [];
  return products.filter((p) => filteredIds.has(p.id)).slice(0, 8);
}

export default function Home() {
  // 선택 상태
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<"closed" | "half" | "full">("closed");

  // 도시 태그 클릭 → flyTo
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const handleCityTagClick = useCallback((lat: number, lng: number) => {
    setFlyToTarget({ lat, lng, seq: Date.now() });
    setSheetState("closed");
  }, []);

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

  // ProductList 표시 중일 때 해당 위치 상품 ID set (마커 opacity 제어용)
  const selectedLocationProductIds = useMemo(() => {
    if (!selectedLocation) return null;
    return new Set(selectedLocation.products.map((p) => p.id));
  }, [selectedLocation]);

  const handleRankingSelect = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setSelectedLocation(null);
    setSheetState("full");
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* 화면 상단 중앙 — 데이터 기준일 (데스크탑만) */}
      {dataDateLabel && (
        <div
          className="hidden md:flex absolute top-4 z-10 pointer-events-none items-center gap-2 px-4 py-1.5 backdrop-blur-sm"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(20,19,28,0.85)",
            borderRadius: "2px",
            borderLeft: "2px solid var(--vermillion)",
            borderRight: "2px solid var(--vermillion)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          }}
        >
          <span
            className="display-italic text-xs tracking-[0.22em] uppercase"
            style={{ color: "var(--paper-500)" }}
          >
            데이터 기준
          </span>
          <span
            className="serif-kr text-sm font-medium tabular-nums"
            style={{ color: "var(--paper-100)" }}
          >
            {dataDateLabel}
          </span>
        </div>
      )}
      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
        durationRange={durationRange}
        onDurationChange={setDurationRange}
        priceMin={priceMin}
        priceMax={priceMax}
        priceStep={PRICE_STEP}
        durationMin={durationMin}
        durationMax={durationMax}
        categories={categories}
        onToggleCategory={handleToggleCategory}
        resultCount={filteredProductIds.size}
        searchMatches={getSearchMatches(products, searchQuery, filteredProductIds)}
        onSelectMatch={(id) => { setSelectedProductId(id); setSelectedLocation(null); setSheetState("full"); setSearchQuery(""); }}
      />
      <RankingPanel products={products} onSelectProduct={handleRankingSelect} onPanelOpen={() => setSheetState("closed")} />
      {sheetState !== "closed" && (
        <div className="absolute inset-0 z-[5]" onClick={() => setSheetState("closed")} />
      )}
      <HyechoMap
        data={geoData}
        multiGeoJSON={multiGeoJSON}
        filteredProductIds={filteredProductIds}
        selectedProductId={selectedProductId}
        selectedLocationProductIds={selectedLocationProductIds}
        locationMap={locationMap}
        onLocationSelect={handleLocationSelect}
        flyToTarget={flyToTarget}
      />
      <BottomSheet state={sheetState} onStateChange={setSheetState}>
        {selectedProduct ? (
          <SiteDetail
            product={selectedProduct}
            locationCount={selectedLocation?.products.length ?? 1}
            onBack={handleBack}
            onCityTagClick={handleCityTagClick}
          />
        ) : selectedLocation ? (
          <ProductList
            location={selectedLocation}
            onSelectProduct={setSelectedProductId}
          />
        ) : null}
      </BottomSheet>
      <ChatWidget />
    </div>
  );
}
