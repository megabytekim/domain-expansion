import type { HyechoProduct, MarkerGeoJSON } from "./types";

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
