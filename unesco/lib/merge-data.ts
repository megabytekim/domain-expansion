import type { HyechoProduct, MarkerGeoJSON, SelectedLocation } from "./types";

export function productsToGeoJSON(products: HyechoProduct[]): MarkerGeoJSON {
  const features = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    for (const loc of product.locations) {
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
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
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

/** 좌표 키 → 해당 위치에 연결된 상품 배열 */
export function buildLocationMap(products: HyechoProduct[]): Map<string, HyechoProduct[]> {
  const map = new Map<string, HyechoProduct[]>();
  for (const product of products) {
    for (const loc of product.locations) {
      const key = locKey(loc.lat, loc.lng);
      const existing = map.get(key) ?? [];
      if (!existing.includes(product)) existing.push(product);
      map.set(key, existing);
    }
  }
  return map;
}

export interface FilterOptions {
  categories: Set<string>;
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
