import type { HyechoProduct, Departure } from "@/lib/types";

interface SiteDetailProps {
  product: HyechoProduct;
  locationCount: number; // 1이면 뒤로가기 숨김
  onBack: () => void;
  onCityTagClick: (lat: number, lng: number) => void;
}

const PROC_LABEL: Record<string, { label: string; className: string }> = {
  "01": { label: "확정", className: "text-emerald-400" },
  "00": { label: "예정", className: "text-yellow-400" },
  "05": { label: "마감", className: "text-gray-500" },
  "40": { label: "완판", className: "text-red-400" },
  "0000": { label: "대기", className: "text-blue-400" },
};

function formatDate(yyyymmdd: string) {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}.${m}.${d}`;
}

function DepartureTable({ departures }: { departures: Departure[] }) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  if (departures.length === 0) {
    return <p className="text-xs text-gray-500 py-2">출발일 정보 없음</p>;
  }

  const rows = [...departures].sort((a, b) => a.startDay.localeCompare(b.startDay));

  return (
    <div className="overflow-auto -mx-1" style={{ maxHeight: "240px" }}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-gray-900">
          <tr className="text-gray-500 border-b border-gray-700">
            <th className="text-left py-1 px-1 font-normal">출발일</th>
            <th className="text-right py-1 px-1 font-normal">정원</th>
            <th className="text-right py-1 px-1 font-normal">예약</th>
            <th className="text-right py-1 px-1 font-normal">잔여</th>
            <th className="text-right py-1 px-1 font-normal">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((dep) => {
            const isPast = dep.startDay < today || dep.procCd === "05";
            const status = PROC_LABEL[dep.procCd] ?? { label: dep.procCd, className: "text-gray-400" };
            return (
              <tr
                key={dep.eventSeq}
                className={`border-b border-gray-800 ${isPast ? "opacity-40" : ""}`}
              >
                <td className="py-1 px-1 text-gray-200">{formatDate(dep.startDay)}</td>
                <td className="py-1 px-1 text-right text-gray-400">{dep.personCnt}</td>
                <td className="py-1 px-1 text-right text-gray-400">{dep.resvCnt}</td>
                <td className={`py-1 px-1 text-right font-medium ${dep.restCnt <= 3 && !isPast ? "text-red-400" : "text-gray-300"}`}>
                  {dep.restCnt}
                </td>
                <td className={`py-1 px-1 text-right ${status.className}`}>{status.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SiteDetail({ product, locationCount, onBack, onCityTagClick }: SiteDetailProps) {
  return (
    <div className="space-y-3">
      {/* 뒤로가기 */}
      {locationCount > 1 && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-gray-900">
          <button
            onClick={onBack}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← 목록으로
          </button>
        </div>
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
        <div>
          <p className="text-xs text-gray-500 mb-1.5">지도에서 보기 →</p>
          <div className="flex flex-wrap gap-1.5">
          {product.locations.map((loc) => (
            <button
              key={`${loc.name}-${loc.lat}-${loc.lng}`}
              onClick={() => onCityTagClick(loc.lat, loc.lng)}
              className="px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
              style={{ background: "rgba(30,58,138,0.5)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.3)" }}
            >
              {loc.name}
            </button>
          ))}
          </div>
        </div>
      )}

      {/* 출발 일정 */}
      <div>
        <div className="flex items-baseline gap-1.5 mb-1.5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">출발 일정</h3>
          {product.departuresUpdatedAt && (() => {
            const d = new Date(product.departuresUpdatedAt!);
            return <span className="text-xs text-gray-600">{d.getMonth() + 1}/{d.getDate()} 기준</span>;
          })()}
        </div>
        <DepartureTable departures={product.departures ?? []} />
      </div>

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
