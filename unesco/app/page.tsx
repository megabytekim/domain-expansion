"use client";

import { useState, useCallback } from "react";
import HyechoMap from "@/components/UnescoMap";
import BottomSheet from "@/components/BottomSheet";
import SiteDetail from "@/components/SiteDetail";
import FilterBar from "@/components/FilterBar";
import { productsToGeoJSON } from "@/lib/merge-data";
import type { MarkerProperties, HyechoProduct, CategoryFilter } from "@/lib/types";
import rawProducts from "@/data/hyecho-packages.json";

const products = rawProducts as unknown as HyechoProduct[];
const geoData = productsToGeoJSON(products);

export default function Home() {
  const [selectedMarker, setSelectedMarker] = useState<MarkerProperties | null>(null);
  const [sheetState, setSheetState] = useState<"closed" | "half" | "full">("closed");
  const [categories, setCategories] = useState<Set<CategoryFilter>>(
    new Set(["trekking", "culture", "walking"])
  );

  const handleMarkerSelect = useCallback((props: MarkerProperties | null) => {
    setSelectedMarker(props);
    setSheetState(props ? "half" : "closed");
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

  return (
    <div className="relative h-full w-full">
      <FilterBar
        categories={categories}
        onToggleCategory={handleToggleCategory}
      />
      <HyechoMap
        data={geoData}
        onMarkerSelect={handleMarkerSelect}
        filterCategories={categories}
      />
      <BottomSheet state={sheetState} onStateChange={setSheetState}>
        {selectedMarker && <SiteDetail marker={selectedMarker} />}
      </BottomSheet>
    </div>
  );
}
