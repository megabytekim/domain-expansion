"use client";

import { useState } from "react";
import type { HyechoProduct } from "@/lib/types";

interface RankedProduct {
  product: HyechoProduct;
  score: number;      // 예약률 0~1
  resvCnt: number;
  personCnt: number;
  nextDate: string | null;
}

function computeRanking(products: HyechoProduct[]): RankedProduct[] {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const d90 = new Date();
  d90.setDate(d90.getDate() + 90);
  const cutoff = d90.toISOString().slice(0, 10).replace(/-/g, "");

  const effResv = (d: { procCd: string; resvCnt: number; personCnt: number }) => {
    if (d.procCd === "05" || d.procCd === "40") return d.personCnt;
    return Math.min(d.resvCnt, d.personCnt);
  };

  // 1단계: 전체 평균 예약률 m 계산 (90일 window 기준)
  let globalResv = 0;
  let globalPerson = 0;
  for (const p of products) {
    const window = (p.departures ?? []).filter(
      (d) => d.startDay >= today && d.startDay <= cutoff
    );
    const sample = window.length > 0 ? window
      : (p.departures ?? []).filter((d) => d.startDay >= today).slice(0, 3);
    for (const d of sample) {
      globalResv += effResv(d);
      globalPerson += d.personCnt;
    }
  }
  const m = globalPerson > 0 ? globalResv / globalPerson : 0.5;

  // C = 사전 강도: 전체 평균 정원 수준 (약 3회 출발 분량)
  const avgPersonPerProduct = globalPerson / products.length;
  const C = avgPersonPerProduct * 3;

  // 2단계: 상품별 베이지안 스코어
  const ranked: RankedProduct[] = [];
  for (const product of products) {
    const allUpcoming = (product.departures ?? [])
      .filter((d) => d.startDay >= today)
      .sort((a, b) => a.startDay.localeCompare(b.startDay));
    if (allUpcoming.length === 0) continue;

    const window = allUpcoming.filter((d) => d.startDay <= cutoff);
    const sample = window.length > 0 ? window : allUpcoming.slice(0, 3);

    const sumResv = sample.reduce((s, d) => s + effResv(d), 0);
    const sumPerson = sample.reduce((s, d) => s + d.personCnt, 0);

    // Bayesian 예약률 × √(절대 예약자 수) 하이브리드
    const bayesianRate = (C * m + sumResv) / (C + sumPerson);
    const score = bayesianRate * Math.sqrt(sumResv);

    const nextDate = allUpcoming[0]?.startDay ?? null;
    ranked.push({ product, score, resvCnt: sumResv, personCnt: sumPerson, nextDate });
  }

  return ranked.sort((a, b) => b.score - a.score);
}

function formatDate(yyyymmdd: string) {
  return `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

interface RankingPanelProps {
  products: HyechoProduct[];
  onSelectProduct: (id: string) => void;
  onPanelOpen?: () => void;
}

export default function RankingPanel({ products, onSelectProduct, onPanelOpen }: RankingPanelProps) {
  const ranked = computeRanking(products);
  const [mobileOpen, setMobileOpen] = useState(false);

  const dataDate = (() => {
    const iso = products[0]?.departuresUpdatedAt;
    if (!iso) return null;
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  })();

  const panelContent = (
    <>
      <div className="px-3 pt-3 pb-2 border-b shrink-0 flex items-start justify-between" style={{ borderColor: "var(--ink-border)" }}>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="serif-kr text-sm" style={{ color: "var(--paper-100)", letterSpacing: "0.04em" }}>인기 순위</span>
            {dataDate && (
              <span className="text-[10px] tracking-wider" style={{ color: "var(--paper-500)" }}>{dataDate} 기준</span>
            )}
          </div>
          <p className="text-[11px] mt-1 leading-snug" style={{ color: "var(--paper-500)" }}>
            <span className="display-italic">90일 예약률 × √예약자수</span>
          </p>
        </div>
        {/* 모바일에서만 닫기 버튼 */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden text-lg leading-none ml-2"
          style={{ color: "var(--paper-500)" }}
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      <ul className="overflow-y-auto" style={{ borderColor: "var(--ink-border)" }}>
        {(() => {
          const maxScore = ranked[0]?.score ?? 1;
          return ranked.map((item, idx) => {
          const barPct = Math.round((item.score / maxScore) * 100);
          const isTop = idx < 3;
          return (
            <li key={item.product.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--ink-border)" }}>
              <button
                onClick={() => { onSelectProduct(item.product.id); setMobileOpen(false); }}
                className="w-full text-left px-3 py-2 transition-colors flex items-start gap-2 hover:bg-[rgba(244,236,216,0.04)]"
              >
                <span
                  className="display-italic text-base mt-0.5 shrink-0 w-5 text-center leading-none"
                  style={{ color: isTop ? "var(--vermillion)" : "var(--paper-500)" }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="serif-kr text-[12px] leading-tight line-clamp-2" style={{ color: "var(--paper-100)" }}>{item.product.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-px" style={{ background: "rgba(244,236,216,0.12)" }}>
                      <div className="h-px" style={{ width: `${barPct}%`, background: "var(--vermillion)" }} />
                    </div>
                    <span className="text-[10px] shrink-0 tabular-nums" style={{ color: "var(--vermillion)" }}>{item.resvCnt}명</span>
                  </div>
                  {item.nextDate && (
                    <p className="text-[10px] mt-1 tracking-wide" style={{ color: "var(--paper-500)" }}>다음 출발 {formatDate(item.nextDate)}</p>
                  )}
                </div>
              </button>
            </li>
          );
        });
        })()}
      </ul>
    </>
  );

  return (
    <>
      {/* 모바일 토글 버튼 — md 이상에서는 숨김 */}
      <div
        className="md:hidden absolute z-10"
        style={{
          top: "90px",
          right: "12px",
          padding: "2px",
          borderRadius: "4px",
          background: "linear-gradient(180deg, rgba(192,57,43,0.9), rgba(192,57,43,0.55))",
          boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
        }}
      >
        <button
          onClick={() => { setMobileOpen(true); onPanelOpen?.(); }}
          className="flex flex-col items-center justify-center gap-0.5"
          style={{
            width: "80px",
            height: "80px",
            background: "var(--paper-100)",
            borderRadius: "3px",
          }}
          aria-label="인기순위 열기"
        >
          <span className="serif-kr" style={{ fontSize: "28px", lineHeight: 1, color: "var(--ink-deep)", fontWeight: 700 }}>頂</span>
          <span className="text-[10px] mt-1 tracking-[0.25em]" style={{ color: "var(--ink-deep)" }}>인기순</span>
        </button>
      </div>

      {/* 모바일 패널 (오픈 시) */}
      {mobileOpen && (
        <div
          className="md:hidden absolute right-3 z-20 flex flex-col rounded-md shadow-2xl scroll-edge paper-grain"
          style={{
            top: "90px",
            width: "240px",
            maxHeight: "calc(100dvh - 160px)",
            background: "rgba(31,29,42,0.96)",
            backdropFilter: "blur(10px)",
          }}
        >
          {panelContent}
        </div>
      )}

      {/* 데스크탑 패널 — 항상 표시 */}
      <div
        className="hidden md:flex absolute right-3 z-10 flex-col rounded-md shadow-2xl scroll-edge paper-grain"
        style={{
          top: "90px",
          width: "240px",
          maxHeight: "calc(100dvh - 160px)",
          background: "rgba(31,29,42,0.96)",
          backdropFilter: "blur(10px)",
        }}
      >
        {panelContent}
      </div>
    </>
  );
}
