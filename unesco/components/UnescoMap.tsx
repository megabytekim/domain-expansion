"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { MarkerGeoJSON, SelectedLocation } from "@/lib/types";
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
  // map 'load' 이벤트는 첫 마운트 시 단 1회만 발화 — once("load", ...) 패턴은 두 번째 호출부터 stuck.
  // 대신 마운트 useEffect의 load 콜백 끝에서 styleReady=true 설정, 다른 useEffect는 이 state를 기다린다.
  const [styleReady, setStyleReady] = useState(false);

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

      let lastPopupProductId: string | null = null;
      map.on("mousemove", "markers", (e) => {
        // Drill-in 모드(상품 선택됨)에선 dim된 centroid의 popup 숨김 — 5개 expanded marker만 의미 있음
        if (selectedProductIdRef.current) return;
        const feature = e.features?.[0];
        if (!feature) return;
        const productId = feature.properties?.productId as string;
        const title = feature.properties?.productTitle ?? "";
        const imageUrl = feature.properties?.productImageUrl as string | undefined;

        if (productId !== lastPopupProductId) {
          const container = document.createElement("div");
          container.style.cssText = "max-width:200px;display:flex;flex-direction:column;gap:6px";
          if (imageUrl) {
            const img = document.createElement("img");
            img.src = imageUrl;
            img.loading = "lazy";
            img.style.cssText = "width:100%;height:90px;object-fit:cover;border-radius:2px;display:block";
            container.appendChild(img);
          }
          const span = document.createElement("span");
          span.style.cssText = "font-size:12px;color:#e2e8f0;white-space:normal;line-height:1.3;display:block";
          span.textContent = title;
          container.appendChild(span);
          popup.setDOMContent(container);
          lastPopupProductId = productId;
        }
        popup.setLngLat(e.lngLat).addTo(map);
      });

      map.on("mouseleave", "markers", () => {
        popup.remove();
        lastPopupProductId = null;
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

      // source/layer 추가 완료 — 다른 useEffect들이 즉시 setData 가능한 상태
      setStyleReady(true);
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
    if (!styleReady) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [flyToTarget.lng, flyToTarget.lat], zoom: Math.max(map.getZoom(), 6), duration: 600 });
  }, [flyToTarget, styleReady]);

  // Drill-in: 선택 product의 expanded GeoJSON 갱신 + fitBounds
  useEffect(() => {
    if (!styleReady) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("hyecho-expanded") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(expandedGeoJSON as unknown as GeoJSON.FeatureCollection);
    if (expandedGeoJSON.features.length === 1) {
      const coord = expandedGeoJSON.features[0].geometry.coordinates as [number, number];
      map.flyTo({ center: coord, zoom: Math.max(map.getZoom(), 4), duration: 800 });
    } else if (expandedGeoJSON.features.length >= 2) {
      const first = expandedGeoJSON.features[0].geometry.coordinates as [number, number];
      const bounds = new maplibregl.LngLatBounds(first, first);
      for (const f of expandedGeoJSON.features) {
        bounds.extend(f.geometry.coordinates as [number, number]);
      }
      map.fitBounds(bounds, { padding: 80, maxZoom: 5, duration: 800 });
    } else {
      // selectedProductId 해제됨 → 초기 globe view로 복귀
      map.flyTo({ center: [30, 25], zoom: 2, duration: 800 });
    }
  }, [expandedGeoJSON, styleReady]);

  // 필터/선택 상태 → 마커 source data 갱신
  useEffect(() => {
    if (!styleReady) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("hyecho") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    // Drill-in: source에 selected feature만 포함 (다른 marker 완전 제거)
    if (selectedProductId) {
      const selected = data.features.find((f) => f.properties.productId === selectedProductId);
      source.setData({
        type: "FeatureCollection",
        features: selected ? [{ ...selected, properties: { ...selected.properties, _opacity: 1.0, _selected: true } }] : [],
      } as unknown as GeoJSON.FeatureCollection);
      return;
    }

    const features = data.features.map((f) => {
      const id = f.properties.productId;
      const isFiltered = filteredProductIds.has(id);

      let opacity: number;
      if (selectedLocationProductIds) {
        opacity = selectedLocationProductIds.has(id) ? 1.0 : 0.3;
      } else {
        opacity = isFiltered ? 1.0 : 0.2;
      }

      return {
        ...f,
        properties: { ...f.properties, _opacity: opacity, _selected: false },
      };
    });

    source.setData({
      type: "FeatureCollection",
      features,
    } as unknown as GeoJSON.FeatureCollection);
  }, [data, filteredProductIds, selectedProductId, selectedLocationProductIds, styleReady]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
