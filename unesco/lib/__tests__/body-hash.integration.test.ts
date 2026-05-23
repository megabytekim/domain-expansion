/**
 * 실제 혜초 페이지 bodyText로 body-hash 검증.
 * Run: cd unesco && npx tsx --test lib/__tests__/body-hash.integration.test.ts
 *
 * Prereq: /tmp/crawl-bodies/hyecho-{2476,3060,3350}.txt 존재.
 *         없으면 `npx tsx scripts/extract-one.ts hyecho-2476 hyecho-3060 hyecho-3350`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { hashBody, normalizeBodyText } from "../body-hash";

const FIXTURES = ["hyecho-2476", "hyecho-3060", "hyecho-3350"];
const haveFixtures = FIXTURES.every((id) => existsSync(`/tmp/crawl-bodies/${id}.txt`));

function loadBody(id: string): string {
  return readFileSync(`/tmp/crawl-bodies/${id}.txt`, "utf-8");
}

test("실 본문: 같은 input은 결정적", { skip: !haveFixtures }, () => {
  const body = loadBody("hyecho-2476");
  assert.equal(hashBody(body), hashBody(body));
});

test("실 본문: 다른 패키지는 다른 hash", { skip: !haveFixtures }, () => {
  const a = hashBody(loadBody("hyecho-2476"));
  const b = hashBody(loadBody("hyecho-3060"));
  const c = hashBody(loadBody("hyecho-3350"));
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.notEqual(a, c);
});

test("실 본문: 가짜 날짜 변경 시뮬레이션 → hash 동일", { skip: !haveFixtures }, () => {
  const original = loadBody("hyecho-2476");
  // 본문 안의 모든 날짜를 +1년 한 거짓 미래 본문
  const modified = original.replace(/2026/g, "2027");
  assert.equal(
    hashBody(original),
    hashBody(modified),
    "년도만 바뀐 본문은 같은 hash여야 (날짜는 noise)"
  );
});

test("실 본문: 가짜 도시 추가 시뮬레이션 → hash 변경", { skip: !haveFixtures }, () => {
  const original = loadBody("hyecho-2476");
  const modified = original + "\n6일차 새로운도시 - 또다른도시";
  assert.notEqual(
    hashBody(original),
    hashBody(modified),
    "도시명 추가는 hash 변경 트리거여야"
  );
});

test("실 본문: 정규화 후 도시명·일정 키워드 보존", { skip: !haveFixtures }, () => {
  // 백두산 패키지: 정규화 후에도 핵심 키워드 살아있어야
  const normalized = normalizeBodyText(loadBody("hyecho-2476"));
  assert.ok(normalized.includes("심양"), "심양 도시명 보존");
  assert.ok(normalized.includes("일차"), "N일차 키워드 보존");
  // 반대로 noise 토큰 자리에 placeholder
  assert.ok(normalized.includes("<DATE>"), "날짜는 <DATE> 토큰으로");
});

test("실 본문: 길이가 정상 범위", { skip: !haveFixtures }, () => {
  for (const id of FIXTURES) {
    const len = loadBody(id).length;
    assert.ok(len > 1000 && len < 200000, `${id} length ${len} 비정상`);
  }
});
