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
      <p className="display-italic text-[11px] tracking-[0.18em] uppercase pb-2" style={{ color: "var(--paper-500)" }}>
        {locationName && `${locationName} · `}{location.products.length}개 상품
      </p>
      {location.products.map((product) => (
        <button
          key={product.id}
          onClick={() => onSelectProduct(product.id)}
          className="w-full flex items-center gap-3 p-3 text-left transition-all hover:translate-x-0.5"
          style={{
            background: "rgba(244,236,216,0.04)",
            borderLeft: "2px solid var(--ink-border)",
            borderRadius: "2px",
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              className="w-14 h-14 object-cover flex-shrink-0"
              style={{ borderRadius: "2px" }}
            />
          ) : (
            <div className="w-14 h-14 flex-shrink-0" style={{ background: "var(--ink-soft)", borderRadius: "2px" }} />
          )}
          <div className="flex-1 min-w-0">
            <p className="serif-kr text-sm font-semibold line-clamp-2 leading-snug" style={{ color: "var(--paper-100)" }}>
              {product.title}
            </p>
            <div className="flex items-baseline gap-3 mt-1.5">
              {product.price && (
                <span className="serif-kr text-sm font-bold tabular-nums" style={{ color: "var(--vermillion)" }}>₩{product.price}</span>
              )}
              {product.duration && (
                <span className="display-italic text-xs tracking-wider" style={{ color: "var(--paper-500)" }}>{product.duration}</span>
              )}
            </div>
          </div>
          <span className="display-italic flex-shrink-0" style={{ color: "var(--paper-500)" }}>→</span>
        </button>
      ))}
    </div>
  );
}
