import type { HyechoProduct, Departure } from "@/lib/types";

interface SiteDetailProps {
  product: HyechoProduct;
  locationCount: number; // 1이면 뒤로가기 숨김
  onBack: () => void;
  onCityTagClick: (lat: number, lng: number) => void;
}

const PROC_LABEL: Record<string, { label: string; color: string }> = {
  "01": { label: "확정", color: "var(--jade)" },
  "00": { label: "예정", color: "#c9a86a" },
  "05": { label: "마감", color: "var(--paper-500)" },
  "40": { label: "완판", color: "var(--vermillion)" },
  "0000": { label: "대기", color: "#7a9aa3" },
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
    return <p className="text-xs py-2 display-italic" style={{ color: "var(--paper-500)" }}>출발일 정보 없음</p>;
  }

  const rows = [...departures].sort((a, b) => a.startDay.localeCompare(b.startDay));

  return (
    <div className="overflow-auto -mx-1" style={{ maxHeight: "240px" }}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0" style={{ background: "var(--ink-deep)" }}>
          <tr style={{ borderBottom: "1px solid var(--ink-border)" }}>
            <th className="text-left py-1.5 px-1 font-normal display-italic tracking-wider" style={{ color: "var(--paper-500)" }}>출발일</th>
            <th className="text-right py-1.5 px-1 font-normal display-italic tracking-wider" style={{ color: "var(--paper-500)" }}>정원</th>
            <th className="text-right py-1.5 px-1 font-normal display-italic tracking-wider" style={{ color: "var(--paper-500)" }}>예약</th>
            <th className="text-right py-1.5 px-1 font-normal display-italic tracking-wider" style={{ color: "var(--paper-500)" }}>잔여</th>
            <th className="text-right py-1.5 px-1 font-normal display-italic tracking-wider" style={{ color: "var(--paper-500)" }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((dep) => {
            const isPast = dep.startDay < today || dep.procCd === "05";
            const status = PROC_LABEL[dep.procCd] ?? { label: dep.procCd, color: "var(--paper-500)" };
            return (
              <tr
                key={dep.eventSeq}
                style={{ borderBottom: "1px solid rgba(244,236,216,0.06)", opacity: isPast ? 0.4 : 1 }}
              >
                <td className="py-1 px-1 serif-kr tabular-nums" style={{ color: "var(--paper-100)" }}>{formatDate(dep.startDay)}</td>
                <td className="py-1 px-1 text-right tabular-nums" style={{ color: "var(--paper-500)" }}>{dep.personCnt}</td>
                <td className="py-1 px-1 text-right tabular-nums" style={{ color: "var(--paper-500)" }}>{dep.resvCnt}</td>
                <td className="py-1 px-1 text-right font-medium tabular-nums" style={{ color: dep.restCnt <= 3 && !isPast ? "var(--vermillion)" : "var(--paper-200)" }}>
                  {dep.restCnt}
                </td>
                <td className="py-1 px-1 text-right serif-kr" style={{ color: status.color }}>{status.label}</td>
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
    <div className="space-y-4">
      {/* 뒤로가기 */}
      {locationCount > 1 && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5" style={{ background: "var(--ink-deep)" }}>
          <button
            onClick={onBack}
            className="text-xs display-italic tracking-wider transition-opacity hover:opacity-70"
            style={{ color: "var(--vermillion)" }}
          >
            ← 목록으로
          </button>
        </div>
      )}

      {/* 상품 이미지 */}
      {product.imageUrl && (
        <div className="relative -mx-4">
          <img
            src={product.imageUrl}
            alt={product.title}
            className="w-full h-48 object-cover"
            loading="lazy"
          />
          {/* sepia 오버레이 (하단 그라데이션) */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
            style={{ background: "linear-gradient(to top, var(--ink-deep), transparent)" }}
          />
        </div>
      )}

      {/* 제목 */}
      <h2 className="serif-kr text-xl font-bold leading-snug" style={{ color: "var(--paper-100)" }}>{product.title}</h2>

      {/* 가격 + 기간 */}
      <div className="flex items-baseline gap-4 pb-2" style={{ borderBottom: "1px solid var(--ink-border)" }}>
        {product.price && (
          <span className="serif-kr text-2xl font-bold tabular-nums" style={{ color: "var(--vermillion)" }}>
            ₩{product.price}
          </span>
        )}
        {product.duration && (
          <span className="display-italic text-base tracking-wider" style={{ color: "var(--paper-500)" }}>{product.duration}</span>
        )}
      </div>

      {/* 경유 도시 태그 */}
      {product.locations.length > 0 && (
        <div>
          <p className="display-italic text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: "var(--paper-500)" }}>지도에서 보기</p>
          <div className="flex flex-wrap gap-1.5">
          {product.locations.map((loc, idx) => (
            <button
              key={`${loc.name}-${loc.lat}-${loc.lng}`}
              onClick={() => onCityTagClick(loc.lat, loc.lng)}
              className="serif-kr text-xs transition-opacity hover:opacity-70 px-2.5 py-1"
              style={{
                background: "rgba(244,236,216,0.04)",
                color: "var(--paper-100)",
                border: "1px solid rgba(244,236,216,0.18)",
                borderRadius: "2px",
              }}
            >
              <span className="display-italic mr-1" style={{ color: "var(--paper-500)" }}>{idx + 1}.</span>
              {loc.name}
            </button>
          ))}
          </div>
        </div>
      )}

      {/* 출발 일정 */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h3 className="serif-kr text-sm font-semibold tracking-wide" style={{ color: "var(--paper-100)" }}>출발 일정</h3>
          {product.departuresUpdatedAt && (() => {
            const d = new Date(product.departuresUpdatedAt!);
            return <span className="display-italic text-[11px]" style={{ color: "var(--paper-500)" }}>{d.getMonth() + 1}/{d.getDate()} 기준</span>;
          })()}
        </div>
        <DepartureTable departures={product.departures ?? []} />
      </div>

      {/* 혜초 링크 */}
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-2.5 serif-kr text-sm font-medium transition-all hover:translate-x-1"
        style={{
          background: "var(--paper-100)",
          color: "var(--ink-deep)",
          borderRadius: "2px",
          borderLeft: "3px solid var(--vermillion)",
        }}
      >
        혜초여행에서 보기 →
      </a>
    </div>
  );
}
