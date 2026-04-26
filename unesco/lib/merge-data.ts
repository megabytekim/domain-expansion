import type { UnescoGeoJSON, HyechoPackage } from "./types";

interface RawHyechoPackage {
  id: string;
  title: string;
  price: string;
  duration: string;
  url: string;
  destinations: string[];
}

type MappingTable = Record<string, number[]>;

export function mergeData(
  unesco: UnescoGeoJSON,
  packages: RawHyechoPackage[],
  mapping: MappingTable
): UnescoGeoJSON {
  const siteToPackages = new Map<number, HyechoPackage[]>();

  for (const pkg of packages) {
    const siteIds = mapping[pkg.id] || [];
    for (const siteId of siteIds) {
      if (!siteToPackages.has(siteId)) {
        siteToPackages.set(siteId, []);
      }
      siteToPackages.get(siteId)!.push(pkg);
    }
  }

  return {
    ...unesco,
    features: unesco.features.map((feature) => {
      const pkgs = siteToPackages.get(feature.properties.id) || [];
      return {
        ...feature,
        properties: {
          ...feature.properties,
          hasHyecho: pkgs.length > 0,
          hyechoPackages: pkgs,
        },
      };
    }),
  };
}
