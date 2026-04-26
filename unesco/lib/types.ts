export interface UnescoSiteProperties {
  id: number;
  name: string;
  country: string;
  isoCode: string;
  region: string;
  category: "Cultural" | "Natural" | "Mixed";
  year: number;
  endangered: boolean;
  description: string;
  imageUrl: string;
  url: string;
  criteria: string;
  hasHyecho: boolean;
  hyechoPackages: HyechoPackage[];
}

export interface HyechoPackage {
  id: string;
  title: string;
  price: string;
  duration: string;
  url: string;
  destinations: string[];
}

export interface UnescoSiteFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: UnescoSiteProperties;
}

export interface UnescoGeoJSON {
  type: "FeatureCollection";
  features: UnescoSiteFeature[];
}

export type CategoryFilter = "Cultural" | "Natural" | "Mixed";

export interface FilterState {
  categories: Set<CategoryFilter>;
  hyechoOnly: boolean;
  region: string | null;
}
