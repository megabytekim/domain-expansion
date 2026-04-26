"use client";

import { useState, useCallback } from "react";
import UnescoMap from "@/components/UnescoMap";
import BottomSheet from "@/components/BottomSheet";
import SiteDetail from "@/components/SiteDetail";
import FilterBar from "@/components/FilterBar";
import type { UnescoSiteProperties, UnescoGeoJSON, CategoryFilter } from "@/lib/types";
import rawData from "@/data/unesco-sites.json";

const data = rawData as unknown as UnescoGeoJSON;

export default function Home() {
  const [selectedSite, setSelectedSite] = useState<UnescoSiteProperties | null>(null);
  const [sheetState, setSheetState] = useState<"closed" | "half" | "full">("closed");
  const [categories, setCategories] = useState<Set<CategoryFilter>>(
    new Set(["Cultural", "Natural", "Mixed"])
  );
  const [hyechoOnly, setHyechoOnly] = useState(false);
  const [region, setRegion] = useState<string | null>(null);

  const handleSiteSelect = useCallback((site: UnescoSiteProperties | null) => {
    setSelectedSite(site);
    setSheetState(site ? "half" : "closed");
  }, []);

  const handleToggleCategory = useCallback((cat: CategoryFilter) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat); // don't allow empty
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const handleToggleHyecho = useCallback(() => {
    setHyechoOnly((prev) => !prev);
  }, []);

  return (
    <div className="relative h-full w-full">
      <FilterBar
        categories={categories}
        onToggleCategory={handleToggleCategory}
        hyechoOnly={hyechoOnly}
        onToggleHyecho={handleToggleHyecho}
      />
      <UnescoMap
        data={data}
        onSiteSelect={handleSiteSelect}
        filterState={{ categories, hyechoOnly, region }}
      />
      <BottomSheet state={sheetState} onStateChange={setSheetState}>
        {selectedSite && (
          <SiteDetail site={selectedSite} isFullView={sheetState === "full"} />
        )}
      </BottomSheet>
    </div>
  );
}
