/**
 * 혜초 페이지 bodyText의 정규화 + hash.
 *
 * 목적: 매주 변하는 noise(날짜·잔여좌석·예약수·가격·공백)는 무시하고,
 *       도시·일정 구조 변경만 hash에 반영. → LLM 재호출 불필요한 주에 skip 가능.
 */
import { createHash } from "node:crypto";

/**
 * bodyText에서 매주 바뀌는 noise를 placeholder 토큰으로 치환.
 * 단순 삭제는 인접 단어가 붙어 false positive를 만드므로 토큰(`<DATE>` 등)을 둠.
 */
export function normalizeBodyText(raw: string): string {
  let s = raw;

  // 날짜: 2026.05.23, 2026-05-23, 2026/05/23, 20260523
  s = s.replace(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g, "<DATE>");
  s = s.replace(/\b\d{8}\b/g, "<DATE>");
  // "2026년 5월 23일"
  s = s.replace(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g, "<DATE>");
  // "5/23" 같은 짧은 날짜
  s = s.replace(/\b\d{1,2}\/\d{1,2}\b/g, "<DATE>");
  // 혜초 행사번호: "행사번호 202606-362" — YYYYMM-NNN 형식. 매주 변할 수 있는 ID라 noise.
  s = s.replace(/행사번호\s*[\d-]+/g, "<EVENT_ID>");

  // 요일
  s = s.replace(/\(([월화수목금토일])\)/g, "");
  // 시간 HH:MM
  s = s.replace(/\b\d{1,2}:\d{2}\b/g, "<TIME>");

  // 잔여좌석/예약자수
  s = s.replace(/잔여\s*\d+\s*[석명]/g, "<SEATS>");
  s = s.replace(/예약\s*\d+\s*명/g, "<RESV>");
  // 출발 상태 (한글은 \b 미지원이라 그룹만 사용)
  s = s.replace(/(?:마감|확정|모집중|예약가능|대기예약|출발확정)/g, "<STATUS>");

  // 가격 (price는 별도 필드라 본문 가격은 hash 영향 없어야)
  s = s.replace(/[\d,]{4,}\s*원/g, "<PRICE>");

  // 공백 정규화 (NBSP·en/em space·idiograph space 포함)
  s = s.replace(/[  -​　]/g, " ");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n\s*\n+/g, "\n");
  s = s.trim();

  return s;
}

/**
 * 정규화된 bodyText의 SHA-256 16자 prefix.
 * 154 product 충돌 확률 사실상 0, JSON 가독성 위해 hex 16자.
 */
export function hashBody(raw: string): string {
  const normalized = normalizeBodyText(raw);
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 16);
}
