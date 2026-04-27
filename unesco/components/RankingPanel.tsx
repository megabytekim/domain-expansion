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
      <div className="px-3 py-2 border-b border-white/10 shrink-0 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">인기 순위</span>
            {dataDate && (
              <span className="text-xs text-gray-600">{dataDate} 기준</span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">
            90일 예약률 × √예약자수<br />
            <span className="text-gray-700">데이터 적으면 전체 평균으로 보정</span>
          </p>
        </div>
        {/* 모바일에서만 닫기 버튼 */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden text-gray-500 hover:text-gray-300 text-lg leading-none ml-2"
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      <ul className="divide-y divide-white/5 overflow-y-auto">
        {(() => {
          const maxScore = ranked[0]?.score ?? 1;
          return ranked.map((item, idx) => {
          const barPct = Math.round((item.score / maxScore) * 100);
          return (
            <li key={item.product.id}>
              <button
                onClick={() => { onSelectProduct(item.product.id); setMobileOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors flex items-start gap-2"
              >
                <span
                  className="text-xs font-bold mt-0.5 shrink-0 w-5 text-center"
                  style={{ color: idx < 3 ? "#fbbf24" : "#6b7280" }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-200 leading-tight line-clamp-2">{item.product.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-emerald-400 shrink-0">{item.resvCnt}명</span>
                  </div>
                  {item.nextDate && (
                    <p className="text-xs text-gray-500 mt-0.5">다음 출발 {formatDate(item.nextDate)}</p>
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
          padding: "3px",
          borderRadius: "16px",
          background: "conic-gradient(from 0deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #c77dff, #ff6b6b)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
        }}
      >
        <button
          onClick={() => { setMobileOpen(true); onPanelOpen?.(); }}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl"
          style={{
            width: "80px",
            height: "80px",
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(8px)",
          }}
          aria-label="인기순위 열기"
        >
          <span style={{ fontSize: "30px", lineHeight: 1 }}>🏆</span>
          <span className="text-sm font-semibold text-gray-700 mt-1">인기순</span>
        </button>
      </div>

      {/* 모바일 패널 (오픈 시) */}
      {mobileOpen && (
        <div
          className="md:hidden absolute right-3 z-20 flex flex-col rounded-xl shadow-2xl"
          style={{
            top: "90px",
            width: "220px",
            maxHeight: "calc(100dvh - 160px)",
            background: "rgba(15,23,42,0.92)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {panelContent}
        </div>
      )}

      {/* 데스크탑 패널 — 항상 표시 */}
      <div
        className="hidden md:flex absolute right-3 z-10 flex-col rounded-xl shadow-2xl"
        style={{
          top: "90px",
          width: "220px",
          maxHeight: "calc(100dvh - 160px)",
          background: "rgba(15,23,42,0.92)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {panelContent}
      </div>
    </>
  );
}
