"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { MarkerGeoJSON, SelectedLocation, MultiLocationGeoJSON } from "@/lib/types";
import type { HyechoProduct } from "@/lib/types";
import { locKey } from "@/lib/merge-data";

// 패키지별 구분용 50색 팔레트 (사용자가 색으로 패키지 시각 구분 원함)
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
  multiGeoJSON: MultiLocationGeoJSON;
  expandedGeoJSON: MarkerGeoJSON; // drill-in: 선택 product의 모든 locations
  filteredProductIds: Set<string>;
  selectedProductId: string | null;
  selectedLocationProductIds: Set<string> | null; // ProductList 표시 중일 때 해당 위치의 상품들
  locationMap: Map<string, HyechoProduct[]>;
  onLocationSelect: (loc: SelectedLocation | null) => void;
  flyToTarget: { lat: number; lng: number; seq: number } | null;
}

export default function HyechoMap({
  data,
  multiGeoJSON,
  expandedGeoJSON,
  filteredProductIds,
  selectedProductId,
  selectedLocationProductIds,
  locationMap,
  onLocationSelect,
  flyToTarget,
}: HyechoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onLocationSelect);
  const locationMapRef = useRef(locationMap);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const selectedProductIdRef = useRef<string | null>(null);

  useEffect(() => { onSelectRef.current = onLocationSelect; }, [onLocationSelect]);
  useEffect(() => { locationMapRef.current = locationMap; }, [locationMap]);
  useEffect(() => { selectedProductIdRef.current = selectedProductId; }, [selectedProductId]);

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
      // Globe projection — desktop only (iOS WebKit often fails to init globe)
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        try { (map as unknown as { setProjection: (p: { type: string }) => void }).setProjection({ type: "globe" }); } catch { /* projection may not be supported */ }
      }
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

      // 복수 상품 위치 뱃지
      map.addSource("hyecho-multi", {
        type: "geojson",
        data: multiGeoJSON as unknown as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: "multi-badge-bg",
        type: "circle",
        source: "hyecho-multi",
        paint: {
          "circle-radius": 7,
          "circle-color": "#1e293b",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-translate": [6, -6],
        },
      });
      map.addLayer({
        id: "multi-badge-text",
        type: "symbol",
        source: "hyecho-multi",
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-size": 9,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-offset": [0.55, -0.55],
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Drill-in: 선택 product의 모든 locations (expanded layer)
      map.addSource("hyecho-expanded", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "expanded-markers",
        type: "circle",
        source: "hyecho-expanded",
        paint: {
          "circle-radius": 9,
          "circle-color": [
            "match",
            ["%", ["get", "colorIndex"], PALETTE.length],
            ...PALETTE.flatMap((c, i) => [i, c]),
            "#888",
          ] as unknown as maplibregl.ExpressionSpecification,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
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
        map.flyTo({ center: [lng, lat], duration: 500 });
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
        // Drill-in 모드(상품 선택됨)에선 dim된 centroid의 popup 숨김 — 5개 expanded marker만 의미 있음
        if (selectedProductIdRef.current) return;
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

      // Expanded marker(drill-in 모드의 도시 마커): hover 시 도시명 popup
      map.on("mouseenter", "expanded-markers", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "expanded-markers", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("mousemove", "expanded-markers", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const name = feature.properties?.locationName ?? "";
        const span = document.createElement("span");
        span.style.cssText = "font-size:13px;color:#f4ecd8;font-weight:600;white-space:nowrap;max-width:240px;display:block;overflow:hidden;text-overflow:ellipsis";
        span.textContent = name;
        popup.setLngLat(e.lngLat).setDOMContent(span).addTo(map);
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

  // 도시 태그 클릭 → 해당 좌표로 flyTo
  useEffect(() => {
    if (!flyToTarget) return;
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      map.flyTo({ center: [flyToTarget.lng, flyToTarget.lat], zoom: Math.max(map.getZoom(), 6), duration: 600 });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [flyToTarget]);

  // Drill-in: 선택 product의 expanded GeoJSON 갱신 + fitBounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("hyecho-expanded") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(expandedGeoJSON as unknown as GeoJSON.FeatureCollection);
      if (expandedGeoJSON.features.length === 1) {
        // 단일 location: flyTo로 그 도시로 이동
        const coord = expandedGeoJSON.features[0].geometry.coordinates as [number, number];
        map.flyTo({ center: coord, zoom: Math.max(map.getZoom(), 6), duration: 800 });
      } else if (expandedGeoJSON.features.length >= 2) {
        const first = expandedGeoJSON.features[0].geometry.coordinates as [number, number];
        const bounds = new maplibregl.LngLatBounds(first, first);
        for (const f of expandedGeoJSON.features) {
          bounds.extend(f.geometry.coordinates as [number, number]);
        }
        map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 800 });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [expandedGeoJSON]);

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
          // Drill-in: 모든 centroid를 dim (expanded layer가 그 위에 표시됨)
          opacity = 0.15;
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
