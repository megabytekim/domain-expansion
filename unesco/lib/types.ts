export interface HyechoLocation {
  name: string;
  lat: number;
  lng: number;
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
