export interface HyechoLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface Departure {
  eventSeq: number;
  startDay: string;        // YYYYMMDD
  personCnt: number;       // 정원
  minPersonCnt: number;    // 최소출발인원
  resvCnt: number;         // 예약인원 (실예약 + 가예약)
  restCnt: number;         // 남은좌석
  procCd: string;          // 00=예정, 01=확정, 05=마감, 0000=대기예약
  saleAmt: number;         // 판매가 (원)
}

export interface HyechoProduct {
  id: string;
  category: "trekking" | "culture" | "walking" | "event";
  title: string;
  price: string;
  duration: string;
  url: string;
  imageUrl: string;
  locations: HyechoLocation[];
  departures: Departure[];          // 향후 출발일 목록
  departuresUpdatedAt?: string;     // ISO timestamp
}

// GeoJSON feature for a single marker on the map
export interface MarkerProperties {
  productId: string;
  productTitle: string;
  productPrice: string;
  productDuration: string;
  productUrl: string;
  productImageUrl: string;
  productCategory: string;
  locationName: string;
  colorIndex: number; // index into color palette, same for all locations of a product
  lat: number; // stored in properties to avoid MapLibre tile-quantization of geometry coords
  lng: number;
}

export interface MarkerFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: MarkerProperties;
}

export interface MarkerGeoJSON {
  type: "FeatureCollection";
  features: MarkerFeature[];
}

export type CategoryFilter = "trekking" | "culture" | "walking" | "event";

export interface SelectedLocation {
  lat: number;
  lng: number;
  products: HyechoProduct[];
}

export interface MultiLocationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { count: number; lat: number; lng: number };
}

export interface MultiLocationGeoJSON {
  type: "FeatureCollection";
  features: MultiLocationFeature[];
}
