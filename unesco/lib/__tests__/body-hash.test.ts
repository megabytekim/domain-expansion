/**
 * body-hash 함수의 동작 명세.
 * 핵심 가설: 날짜·예약상태·가격 noise는 무시하고, 도시·일정 구조 변경만 hash에 반영한다.
 * Run: cd unesco && npx tsx --test lib/__tests__/body-hash.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashBody, normalizeBodyText } from "../body-hash";

// ─── 안정성 (noise 무시) ────────────────────────────────────────────────

test("date YYYY.MM.DD 변경은 hash 영향 없음", () => {
  const a = "1일차 인천 - 마닐라\n2026.06.10 출발";
  const b = "1일차 인천 - 마닐라\n2026.07.04 출발";
  assert.equal(hashBody(a), hashBody(b));
});

test("\"YYYY년 M월 D일\" 변경도 무시", () => {
  const a = "예약 마감일: 2026년 6월 10일";
  const b = "예약 마감일: 2026년 7월 4일";
  assert.equal(hashBody(a), hashBody(b));
});

test("시간 HH:MM 변경 무시", () => {
  const a = "09:30 인천 출발";
  const b = "14:45 인천 출발";
  assert.equal(hashBody(a), hashBody(b));
});

test("잔여좌석/예약자수 변경 무시", () => {
  const a = "2026.06.10 잔여 5석 예약 11명 확정";
  const b = "2026.06.10 잔여 0석 예약 16명 마감";
  assert.equal(hashBody(a), hashBody(b));
});

test("가격 변경 무시 (price는 별도 필드로 추적되므로 본문 가격은 hash 영향 없어야)", () => {
  const a = "1,390,000 원";
  const b = "1,490,000 원";
  assert.equal(hashBody(a), hashBody(b));
});

test("공백·NBSP·줄바꿈 변형 무시", () => {
  const a = "1일차 인천 - 마닐라";   // NBSP
  const b = "1일차 인천   -    마닐라";   // 일반 공백 여러 개
  const c = "1일차 인천 - 마닐라\n";      // trailing newline
  assert.equal(hashBody(a), hashBody(b));
  assert.equal(hashBody(b), hashBody(c));
});

test("동일 본문은 항상 같은 hash (결정적)", () => {
  const text = "1일차 인천 - 마닐라\n2일차 보라카이\n3일차 마닐라 - 인천";
  assert.equal(hashBody(text), hashBody(text));
});

// ─── 민감성 (진짜 변경 감지) ─────────────────────────────────────────────

test("도시 추가는 다른 hash", () => {
  const a = "1일차 마닐라\n2일차 보라카이";
  const b = "1일차 마닐라\n2일차 세부\n3일차 보라카이";
  assert.notEqual(hashBody(a), hashBody(b));
});

test("도시 변경(이름 자체 교체)은 다른 hash", () => {
  const a = "1일차 마닐라 - 보라카이";
  const b = "1일차 마닐라 - 세부";
  assert.notEqual(hashBody(a), hashBody(b));
});

test("일정 일수 변경(\"5일\" → \"7일\")은 다른 hash", () => {
  const a = "5일차 마닐라 - 보라카이";
  const b = "7일차 마닐라 - 보라카이";
  assert.notEqual(hashBody(a), hashBody(b));
});

// ─── 출력 형식 ─────────────────────────────────────────────────────────

test("hashBody 결과는 16자 hex", () => {
  const h = hashBody("anything");
  assert.equal(h.length, 16);
  assert.match(h, /^[0-9a-f]+$/);
});

test("normalizeBodyText는 토큰으로 치환 (인접 단어 안 붙음)", () => {
  // "5월부산" 같은 false positive 방지 확인 — 토큰이 도시명과 붙지 않아야
  const out = normalizeBodyText("2026.05.23 부산");
  assert.ok(out.includes("부산"), "도시명은 보존돼야");
  // 날짜와 도시 사이가 숫자로 붙으면 false positive
  assert.ok(!/\d부산/.test(out));
});
