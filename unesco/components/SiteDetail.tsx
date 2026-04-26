import type { MarkerProperties } from "@/lib/types";

interface SiteDetailProps {
  marker: MarkerProperties;
}

export default function SiteDetail({ marker }: SiteDetailProps) {
  return (
    <div className="space-y-3">
      {/* Product image */}
      {marker.productImageUrl && (
        <img
          src={marker.productImageUrl}
          alt={marker.productTitle}
          className="w-full h-40 object-cover rounded-lg"
          loading="lazy"
        />
      )}

      {/* Product title + location */}
      <div>
        <h2 className="text-lg font-bold text-white">{marker.productTitle}</h2>
        <p className="text-sm text-gray-400 mt-1">{marker.locationName}</p>
      </div>

      {/* Price + duration */}
      <div className="flex gap-4 text-sm">
        {marker.productPrice && (
          <span className="text-emerald-400 font-medium">₩{marker.productPrice}</span>
        )}
        {marker.productDuration && (
          <span className="text-gray-400">{marker.productDuration}</span>
        )}
      </div>

      {/* Link to Hyecho */}
      <a
        href={marker.productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-medium rounded-lg transition-colors"
      >
        혜초여행에서 보기 →
      </a>
    </div>
  );
}
