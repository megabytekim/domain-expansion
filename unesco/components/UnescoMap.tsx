"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { MarkerGeoJSON, MarkerProperties, CategoryFilter } from "@/lib/types";

// 50 distinct colors for products
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
  onMarkerSelect: (props: MarkerProperties | null) => void;
  filterCategories: Set<CategoryFilter>;
}

export default function HyechoMap({ data, onMarkerSelect, filterCategories }: HyechoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onMarkerSelect);

  useEffect(() => { onSelectRef.current = onMarkerSelect; }, [onMarkerSelect]);

  // Init map
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

      // Circle layer — color by product colorIndex
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
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.4)",
          "circle-opacity": 0.9,
        },
      });

      // Click marker
      map.on("click", "markers", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as unknown as MarkerProperties;
        onSelectRef.current(props);
      });

      // Click empty → deselect
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["markers"] });
        if (features.length === 0) onSelectRef.current(null);
      });

      // Cursor
      map.on("mouseenter", "markers", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "markers", () => { map.getCanvas().style.cursor = ""; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("hyecho") as maplibregl.GeoJSONSource;
      if (!source) return;

      const filtered = data.features.filter((f) =>
        filterCategories.has(f.properties.productCategory as CategoryFilter)
      );

      source.setData({
        type: "FeatureCollection",
        features: filtered,
      } as unknown as GeoJSON.FeatureCollection);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [data, filterCategories]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
