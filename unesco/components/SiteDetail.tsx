import type { HyechoProduct } from "@/lib/types";

interface SiteDetailProps {
  product: HyechoProduct;
  locationCount: number; // 1이면 뒤로가기 숨김
  onBack: () => void;
}

export default function SiteDetail({ product, locationCount, onBack }: SiteDetailProps) {
  return (
    <div className="space-y-3">
      {/* 뒤로가기 */}
      {locationCount > 1 && (
        <button
          onClick={onBack}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          ← 목록으로
        </button>
      )}

      {/* 상품 이미지 */}
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-full h-40 object-cover rounded-lg"
          loading="lazy"
        />
      )}

      {/* 제목 */}
      <h2 className="text-lg font-bold text-white leading-snug">{product.title}</h2>

      {/* 가격 + 기간 */}
      <div className="flex gap-4 text-sm">
        {product.price && (
          <span className="text-emerald-400 font-medium">₩{product.price}</span>
        )}
        {product.duration && (
          <span className="text-gray-400">{product.duration}</span>
        )}
      </div>

      {/* 경유 도시 태그 */}
      {product.locations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {product.locations.map((loc) => (
            <span
              key={`${loc.lat}-${loc.lng}`}
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ background: "rgba(30,58,138,0.5)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.3)" }}
            >
              {loc.name}
            </span>
          ))}
        </div>
      )}

      {/* 혜초 링크 */}
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-medium rounded-lg transition-colors"
      >
        혜초여행에서 보기 →
      </a>
    </div>
  );
}
