import type { HyechoLocation, HyechoProduct, MarkerGeoJSON, CategoryFilter, MultiLocationGeoJSON } from "./types";

/**
 * 평균 좌표에 가장 가까운 실제 location (medoid).
 * 평균(centroid) 대신 medoid를 쓰는 이유: 다국가/광역 패키지에서 평균은 무인지대(대양·산속)로 떨어지지만,
 * medoid는 실제 방문 도시라 마커 hover popup의 product title이 의미적으로 정합.
 */
export function productMedoid(product: HyechoProduct): HyechoLocation {
  const locs = product.locations;
  if (locs.length <= 1) return locs[0];
  const avgLat = locs.reduce((s, l) => s + l.lat, 0) / locs.length;
  const avgLng = locs.reduce((s, l) => s + l.lng, 0) / locs.length;
  let best = locs[0];
  let bestDist = Infinity;
  for (const l of locs) {
    const dLat = l.lat - avgLat;
    const dLng = l.lng - avgLng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = l;
    }
  }
  return best;
}

/** product 1개 = feature 1개 (medoid 좌표). 기본 view용 마커. */
export function productsToGeoJSON(products: HyechoProduct[]): MarkerGeoJSON {
  const features: MarkerGeoJSON["features"] = [];
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (product.locations.length === 0) continue;
    const loc = productMedoid(product);
    features.push({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [loc.lng, loc.lat] as [number, number],
      },
      properties: {
        productId: product.id,
        productTitle: product.title,
        productPrice: product.price,
        productDuration: product.duration,
        productUrl: product.url,
        productImageUrl: product.imageUrl,
        productCategory: product.category,
        locationName: loc.name,
        colorIndex: i,
        lat: loc.lat,
        lng: loc.lng,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** 단일 product의 모든 locations를 GeoJSON으로 — drill-in (expanded view) 용. */
export function productLocationsGeoJSON(
  product: HyechoProduct,
  colorIndex: number
): MarkerGeoJSON {
  return {
    type: "FeatureCollection",
    features: product.locations.map((loc) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [loc.lng, loc.lat] as [number, number],
      },
      properties: {
        productId: product.id,
        productTitle: product.title,
        productPrice: product.price,
        productDuration: product.duration,
        productUrl: product.url,
        productImageUrl: product.imageUrl,
        productCategory: product.category,
        locationName: loc.name,
        colorIndex,
        lat: loc.lat,
        lng: loc.lng,
      },
    })),
  };
}

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

/** 좌표 키 → 해당 위치에 연결된 상품 배열. 조회 시 locKey(lat,lng) 사용 */
export function buildLocationMap(products: HyechoProduct[]): Map<string, HyechoProduct[]> {
  const locationMap = new Map<string, HyechoProduct[]>();
  for (const product of products) {
    for (const loc of product.locations) {
      const key = locKey(loc.lat, loc.lng);
      const existing = locationMap.get(key) ?? [];
      if (!existing.includes(product)) existing.push(product);
      locationMap.set(key, existing);
    }
  }
  return locationMap;
}

/** 2개 이상 상품이 있는 위치에 count 뱃지 GeoJSON 생성 */
export function buildMultiLocationGeoJSON(locationMap: Map<string, HyechoProduct[]>): MultiLocationGeoJSON {
  const features = [];
  for (const [key, prods] of locationMap) {
    if (prods.length < 2) continue;
    const [lat, lng] = key.split(",").map(Number);
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
      properties: { count: prods.length, lat, lng },
    });
  }
  return { type: "FeatureCollection", features };
}

export interface FilterOptions {
  categories: Set<CategoryFilter>;
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
