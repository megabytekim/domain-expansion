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
  selectedLocationProductIds: Set<string> | null; // ProductList 표시 중일 때 해당 위치의 상품들
  locationMap: Map<string, HyechoProduct[]>;
  onLocationSelect: (loc: SelectedLocation | null) => void;
}

export default function HyechoMap({
  data,
  filteredProductIds,
  selectedProductId,
  selectedLocationProductIds,
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
          "circle-opacity": ["coalesce", ["get", "_opacity"], 1.0],
          "circle-stroke-opacity": ["coalesce", ["get", "_opacity"], 1.0],
        },
      });

      // 마커 클릭
      map.on("click", "markers", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        // geometry.coordinates가 MapLibre 타일 인코딩으로 정밀도를 잃을 수 있으므로
        // properties에 저장된 원본 좌표를 사용
        const lat = feature.properties?.lat as number;
        const lng = feature.properties?.lng as number;
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
        const span = document.createElement("span");
        span.style.cssText = "font-size:12px;color:#e2e8f0;white-space:nowrap;max-width:200px;display:block;overflow:hidden;text-overflow:ellipsis";
        span.textContent = title;
        popup.setLngLat(e.lngLat).setDOMContent(span).addTo(map);
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

      const features = data.features.map((f) => {
        const id = f.properties.productId;
        const isFiltered = filteredProductIds.has(id);
        const isSelected = selectedProductId === id;

        let opacity: number;
        if (selectedProductId) {
          // 상품 상세: 해당 상품 마커만 강조
          opacity = isSelected ? 1.0 : 0.3;
        } else if (selectedLocationProductIds) {
          // 위치 목록(ProductList): 해당 위치 상품들만 강조
          opacity = selectedLocationProductIds.has(id) ? 1.0 : 0.3;
        } else {
          // 선택 없음: 검색/필터 결과 기반
          opacity = isFiltered ? 1.0 : 0.2;
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
  }, [data, filteredProductIds, selectedProductId, selectedLocationProductIds]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
