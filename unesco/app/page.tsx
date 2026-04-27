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

  // ProductList 표시 중일 때 해당 위치 상품 ID set (마커 opacity 제어용)
  const selectedLocationProductIds = useMemo(() => {
    if (!selectedLocation) return null;
    return new Set(selectedLocation.products.map((p) => p.id));
  }, [selectedLocation]);

  return (
    <div className="relative h-full w-full">
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
        selectedLocationProductIds={selectedLocationProductIds}
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
