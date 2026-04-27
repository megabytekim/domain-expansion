"use client";

import type { SelectedLocation } from "@/lib/types";

interface ProductListProps {
  location: SelectedLocation;
  onSelectProduct: (productId: string) => void;
}

export default function ProductList({ location, onSelectProduct }: ProductListProps) {
  // 이 위치에 연결된 도시명 (products[].locations 중 이 좌표와 일치하는 것)
  const locationName = (() => {
    for (const p of location.products) {
      const match = p.locations.find(
        (l) =>
          Math.abs(l.lat - location.lat) < 0.001 &&
          Math.abs(l.lng - location.lng) < 0.001
      );
      if (match) return match.name;
    }
    return "";
  })();

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 pb-1">
        {locationName && `${locationName} · `}{location.products.length}개 상품
      </p>
      {location.products.map((product) => (
        <button
          key={product.id}
          onClick={() => onSelectProduct(product.id)}
          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
          style={{ background: "rgba(15,23,42,0.8)" }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug">
              {product.title}
            </p>
            <div className="flex gap-3 mt-1">
              {product.price && (
                <span className="text-xs text-emerald-400">₩{product.price}</span>
              )}
              {product.duration && (
                <span className="text-xs text-gray-500">{product.duration}</span>
              )}
            </div>
          </div>
          <span className="text-gray-600 flex-shrink-0">›</span>
        </button>
      ))}
    </div>
  );
}
