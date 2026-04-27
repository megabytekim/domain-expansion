# Hyecho Map — 개선 설계

Date: 2026-04-27

## 목표

혜초여행 지도 앱의 5가지 개선 영역을 구현한다:
1. 같은 위치 다중 상품 탐색 (바텀시트 목록 → 상세 2단계)
2. 검색 + 가격/기간 필터
3. 상품 상세 강화 (경유 도시 태그 + 지도 하이라이트)
4. 지도 인터랙션 (hover 툴팁, 선택 마커 강조)
5. 모바일 최적화 (추후 별도 결정)

---

## 1. 상태 구조 변경 (`app/page.tsx`)

### 현재
```typescript
selectedMarker: MarkerProperties | null
sheetState: "closed" | "half" | "full"
categories: Set<CategoryFilter>
```

### 변경 후
```typescript
selectedLocation: {
  lat: number;
  lng: number;
  products: HyechoProduct[];
} | null

selectedProductId: string | null   // null이면 목록, 값이면 상세

sheetState: "closed" | "half" | "full"
categories: Set<CategoryFilter>
searchQuery: string                 // 목적지·상품명 통합 검색
priceRange: [number, number]        // [min, max] 원 단위, 0이면 무제한
durationRange: [number, number]     // [min, max] 일 단위, 0이면 무제한
```

### 핵심 동작
- 마커 클릭 → `selectedLocation` 설정, `selectedProductId = null` → 목록 표시
- 목록에서 상품 선택 → `selectedProductId` 설정 → 상세 표시
- 상품이 하나뿐인 위치 클릭 → 목록 건너뛰고 바로 상세
- "← 뒤로" → `selectedProductId = null` (목록으로)

---

## 2. 데이터 레이어 (`lib/merge-data.ts`)

### 추가할 것

**`locationToProducts` 맵**
```typescript
// 좌표 키 → 해당 위치에 연결된 상품 배열
type LocationKey = `${number},${number}`
export function buildLocationMap(products: HyechoProduct[]): Map<LocationKey, HyechoProduct[]>
```

**가격/기간 파싱 헬퍼**
```typescript
export function parsePrice(price: string): number   // "9,200,000" → 9200000
export function parseDuration(duration: string): number  // "9일" → 9
```

**필터링 함수**
```typescript
export function filterProducts(
  products: HyechoProduct[],
  opts: {
    categories: Set<CategoryFilter>;
    searchQuery: string;
    priceRange: [number, number];
    durationRange: [number, number];
  }
): HyechoProduct[]
```
- searchQuery: 상품 title + locations[].name 에 포함 여부 (대소문자 무시)
- priceRange[0] === 0이면 하한 무시, priceRange[1] === 0이면 상한 무시 (동일하게 duration)

---

## 3. 신규 컴포넌트

### `components/SearchBar.tsx`
- 검색 인풋 (placeholder: "목적지 또는 상품명 검색")
- 우측에 "필터 ⚙" 버튼 → 드롭다운 패널 토글
- 드롭다운 패널: 가격 range slider + 기간 range slider
- 카테고리 칩을 SearchBar 내부로 흡수 → `FilterBar.tsx` 삭제
- 위치: 좌상단 absolute (현재 FilterBar 위치 대체)

```typescript
interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  priceRange: [number, number];
  onPriceChange: (r: [number, number]) => void;
  durationRange: [number, number];
  onDurationChange: (r: [number, number]) => void;
  categories: Set<CategoryFilter>;
  onToggleCategory: (cat: CategoryFilter) => void;
}
```

가격 슬라이더 범위: 0 ~ 30,000,000원 (데이터 최대값 약 21,900,000원 기준으로 반올림)  
기간 슬라이더 범위: 1 ~ 45일 (데이터 최대값 43일 기준)

### `components/ProductList.tsx`
- 위치명 + 상품 수 헤더 (`돌로미테 · 3개 상품`)
- 상품 카드 목록 (썸네일 44px + 제목 + 가격)
- 각 카드 클릭 → `onSelectProduct(productId)` 콜백

```typescript
interface ProductListProps {
  location: { lat: number; lng: number; products: HyechoProduct[] };
  onSelectProduct: (productId: string) => void;
}
```

### `components/SiteDetail.tsx` 수정
- 상단에 "← {위치명} 목록으로" 뒤로가기 (selectedLocation에 상품 2개+ 있을 때만)
- 경유 도시 태그: `product.locations` 기반으로 파란 배지 렌더링
- 나머지(이미지, 제목, 가격, 기간, CTA 링크)는 현행 유지

```typescript
interface SiteDetailProps {
  product: HyechoProduct;
  locationCount: number;       // 1이면 뒤로가기 숨김
  onBack: () => void;
}
```

`MarkerProperties` 타입은 더 이상 SiteDetail에서 쓰지 않음. UnescoMap에서 클릭 이벤트 콜백 시그니처도 `MarkerProperties` → 좌표 기반으로 교체.

---

## 4. 지도 레이어 변경 (`components/UnescoMap.tsx`)

### 마커 opacity 로직
MapLibre paint expression으로 처리:

| 상황 | 해당 상품 마커 | 나머지 마커 |
|------|--------------|------------|
| 기본 (선택 없음) | 1.0 | 1.0 |
| 상품 선택됨 | 1.0 (선택된 상품) | 0.3 |
| 검색/필터 적용 | 매칭 1.0 | 0.2 |
| 둘 다 | 선택+매칭 1.0 | 0.2 |

`circle-opacity`와 `circle-stroke-opacity` 모두 적용.

### Hover 툴팁
- `mousemove` on `sites` layer → `marker.productTitle` 표시
- MapLibre Popup 사용, offset `[0, -10]`, 최소 스타일 (어두운 배경)
- `mouseleave` → popup 제거

### Props 추가
```typescript
interface HyechoMapProps {
  data: MarkerGeoJSON;
  filteredProductIds: Set<string>;   // 검색/필터 통과한 상품 ID
  selectedProductId: string | null;
  onLocationSelect: (loc: { lat: number; lng: number; products: HyechoProduct[] }) => void;
}
```

`onMarkerSelect` → `onLocationSelect`로 교체.  
마커 클릭 시 같은 좌표의 모든 상품을 `locationToProducts` 맵에서 조회해서 넘김.

---

## 5. `app/page.tsx` 변경 요약

```typescript
// 계산된 값 (useMemo)
const filteredProducts = filterProducts(products, { categories, searchQuery, priceRange, durationRange })
const filteredProductIds = new Set(filteredProducts.map(p => p.id))
const geoData = productsToGeoJSON(products)   // 전체 GeoJSON은 고정
const locationMap = buildLocationMap(products)  // 좌표 → 상품 배열

// 바텀시트 렌더
if (selectedProductId) {
  const product = products.find(p => p.id === selectedProductId)
  return <SiteDetail product={product} locationCount={selectedLocation.products.length} onBack={() => setSelectedProductId(null)} />
} else if (selectedLocation) {
  return <ProductList location={selectedLocation} onSelectProduct={setSelectedProductId} />
}
```

---

## 6. 구현 순서 (의존성 순)

1. `lib/merge-data.ts` — 파싱 헬퍼 + filterProducts + buildLocationMap
2. `lib/types.ts` — props 타입 업데이트 (MarkerProperties 제거 또는 축소)
3. `components/SearchBar.tsx` — 신규 (FilterBar.tsx 대체)
4. `components/ProductList.tsx` — 신규
5. `components/SiteDetail.tsx` — 수정 (HyechoProduct 직접 수신, 뒤로가기 + 도시 태그)
6. `components/UnescoMap.tsx` — opacity 로직 + hover 툴팁 + props 변경
7. `app/page.tsx` — 상태 재설계 + 조합
8. `components/FilterBar.tsx` — 삭제

---

## 스코프 밖

- 모바일 스와이프 제스처 (추후 별도 결정)
- 마커 크기 차등화 (추후 데이터 보고 결정)
- 상품 정렬 (가격순/기간순)
