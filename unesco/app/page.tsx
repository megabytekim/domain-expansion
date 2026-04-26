"use client";

import { useState } from "react";
import UnescoMap from "@/components/UnescoMap";
import type { UnescoSiteProperties, UnescoGeoJSON, CategoryFilter } from "@/lib/types";
import rawData from "@/data/unesco-sites.json";

const data = rawData as unknown as UnescoGeoJSON;

export default function Home() {
  const [selectedSite, setSelectedSite] = useState<UnescoSiteProperties | null>(null);
  const [categories, setCategories] = useState<Set<CategoryFilter>>(
    new Set(["Cultural", "Natural", "Mixed"])
  );
  const [hyechoOnly, setHyechoOnly] = useState(false);
  const [region, setRegion] = useState<string | null>(null);

  return (
    <div className="relative h-full w-full">
      <UnescoMap
        data={data}
        onSiteSelect={setSelectedSite}
        filterState={{ categories, hyechoOnly, region }}
      />
    </div>
  );
}
