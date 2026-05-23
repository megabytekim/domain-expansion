/**
 * LLM-based city extraction step.
 *
 * 흐름:
 *   1. data/hyecho-packages.json 읽기
 *   2. /tmp/crawl-bodies/{productId}.txt 읽기 (crawl-all-hyecho.ts가 저장)
 *   3. `claude --model haiku -p --output-format=json --json-schema ... --resume <session>`로
 *      도시 추출. 같은 chunk 안에선 --resume으로 cache_read 재활용.
 *   4. LLM 결과 길이 > 기존 locations이고 geocode 후도 > 기존이면 LLM으로 교체.
 *
 * Sessions are chunked: CHUNK_SIZE 호출마다 새 session-id 시작
 * (haiku 200k context 보호. 각 호출당 ~6k token 누적).
 *
 * Args (모두 optional):
 *   --skip-existing   (기본 true) — locations 1개 이하인 패키지만 처리
 *   --all             모든 패키지 (skip-existing 무시)
 *   --limit N         처음 N개만
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const execFileP = promisify(execFile);
const PACKAGES_PATH = resolve(__dirname, "../data/hyecho-packages.json");
const GEOCODE_CACHE_PATH = resolve(__dirname, "../data/geocode-cache.json");
const BODIES_DIR = "/tmp/crawl-bodies";

const CHUNK_SIZE = 15;     // 호출 N번마다 새 session-id (context 안전 마진)
const BODY_MAX_CHARS = 24000;
const CLAUDE_TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `당신은 한국 여행사 패키지 페이지에서 실제 "방문 도시" 목록을 추출합니다.

[포함]
- 실제 머무르거나 관광하는 도시 (호텔 체크인/관광 일정 있는 도시)
- 트레킹 루트의 거점 (예: 카트만두, 포카라, 안나푸르나 베이스캠프)

[제외]
- 한국 출발/도착 공항 (인천, 김포)
- 단순 경유 도시 (괄호 안 "(경유)" 표시, 또는 항공사 코드 (TK)/(EK)/(OZ)/(KE) 패턴의 환승 도시)
- 랜드마크/시설명 (~궁전, ~박물관, ~광장, ~모스크, ~사원, ~대성당, ~전망대, 사하라 사막 캠핑 등)
- 기내, 호텔, 식사 같은 일반 명사

confidence는 high/medium/low. 본문에 명확한 일정 표시면 high, 추론이면 medium, 모호하면 low.
low confidence 도시는 제외하세요 (high/medium만 출력).`;

const CITY_SCHEMA = {
  type: "object",
  properties: {
    cities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name_ko: { type: "string" },
          name_en: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["name_ko", "confidence"],
      },
    },
  },
  required: ["cities"],
};

interface LlmCity {
  name_ko: string;
  name_en?: string;
  confidence: "high" | "medium" | "low";
}

interface ClaudeResponse {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: { cities?: LlmCity[] };
  total_cost_usd?: number;
  usage?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

async function extractCitiesViaClaude(
  body: string,
  sessionId: string,
  isFirstInChunk: boolean,
): Promise<{ cities: LlmCity[]; cost: number; cacheRead: number }> {
  const args = [
    "--model", "haiku",
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(CITY_SCHEMA),
  ];
  if (isFirstInChunk) {
    args.push("--session-id", sessionId);
  } else {
    args.push("--resume", sessionId);
  }

  const prompt = `${SYSTEM_PROMPT}\n\n---\n페이지 본문:\n${body.slice(0, BODY_MAX_CHARS)}`;
  args.push(prompt);  // prompt as last argv (avoids stdin timing issue with --print)

  try {
    const { stdout } = await execFileP("claude", args, {
      maxBuffer: 1024 * 1024 * 4,
      timeout: CLAUDE_TIMEOUT_MS,
    });
    const data: ClaudeResponse = JSON.parse(stdout);
    const cities = (data.structured_output?.cities ?? [])
      .filter((c) => c.name_ko && c.confidence !== "low");
    return {
      cities,
      cost: data.total_cost_usd ?? 0,
      cacheRead: data.usage?.cache_read_input_tokens ?? 0,
    };
  } catch (e: any) {
    console.warn(`  LLM call failed: code=${e.code} signal=${e.signal} msg=${e.message?.slice(0, 100)}`);
    if (e.stderr) console.warn(`  stderr: ${String(e.stderr).slice(0, 500)}`);
    if (e.stdout) console.warn(`  stdout: ${String(e.stdout).slice(0, 500)}`);
    return { cities: [], cost: 0, cacheRead: 0 };
  }
}

// Nominatim 1 req/sec mutex
let geocodeChain: Promise<unknown> = Promise.resolve();

async function geocodeWithCache(
  name: string,
  cache: Record<string, { lat: number; lng: number } | null>,
): Promise<{ lat: number; lng: number } | null> {
  if (name in cache) return cache[name];
  const myTurn = geocodeChain.then(async () => {
    if (name in cache) return cache[name];
    await new Promise((r) => setTimeout(r, 1100));
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
        { headers: { "User-Agent": "hyecho-map-crawler/1.0" } },
      );
      const data: any = await res.json();
      const result = data.length > 0
        ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
        : null;
      cache[name] = result;
      return result;
    } catch {
      cache[name] = null;
      return null;
    }
  });
  geocodeChain = myTurn.catch(() => undefined);
  return myTurn;
}

function parseArgs() {
  const argv = process.argv;
  const limit = argv.indexOf("--limit") >= 0
    ? parseInt(argv[argv.indexOf("--limit") + 1], 10)
    : Infinity;
  const all = argv.includes("--all");
  const force = argv.includes("--force");         // bodyHash 비교 무시하고 모두 호출
  const dryRun = argv.includes("--dry-run");      // LLM 호출 안 하고 skip/call 카운트만
  const idsIdx = argv.indexOf("--ids");
  const ids = idsIdx >= 0 ? new Set(argv[idsIdx + 1].split(",").map((s) => s.trim())) : null;
  return { limit, all, force, dryRun, ids };
}

async function main() {
  const { limit, all, force, dryRun, ids } = parseArgs();

  if (!existsSync(BODIES_DIR)) {
    console.error(`No body cache at ${BODIES_DIR}. Run crawl-all-hyecho.ts first.`);
    process.exit(1);
  }

  const packages: any[] = JSON.parse(readFileSync(PACKAGES_PATH, "utf-8"));
  const geocodeCache: Record<string, any> = existsSync(GEOCODE_CACHE_PATH)
    ? JSON.parse(readFileSync(GEOCODE_CACHE_PATH, "utf-8"))
    : {};

  // 대상: --ids 명시 시 그 id만. 그 외엔 전체 (hash skip이 비용 통제).
  // 기존 single-location only 정책은 폐기 — multi도 LLM 재추출이 더 정확한 도시 만들 수 있음
  // (예: "페로제도" 광역 라벨 → 토르스하운/Reykjavik 등 실제 도시)
  const candidates = packages
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => ids ? ids.has(p.id) : true)
    .filter(({ p }) => existsSync(`${BODIES_DIR}/${p.id}.txt`));

  // Hash 기반 incremental: bodyHash === lastLlmHash면 본문 변경 없음 → skip
  // --force / --ids로 명시한 id는 무조건 호출
  let skippedByHash = 0;
  const targets = candidates
    .filter(({ p }) => {
      if (force || ids) return true;
      if (p.bodyHash && p.bodyHash === p.lastLlmHash) {
        skippedByHash++;
        return false;
      }
      return true;
    })
    .slice(0, limit);

  const mode = ids ? `ids=${[...ids].join(",")}` : "all";
  console.log(`Targets: ${targets.length} packages (총 ${packages.length}, ${mode}, hash-skipped ${skippedByHash}${dryRun ? ", DRY-RUN" : ""})`);
  if (dryRun) {
    console.log(`[dry-run] Would call LLM for ${targets.length} packages.`);
    for (const { p } of targets.slice(0, 20)) {
      const reason = !p.bodyHash ? "no bodyHash" : !p.lastLlmHash ? "never called" : "hash changed";
      console.log(`  - ${p.id} (${reason})`);
    }
    return;
  }

  let sessionId = randomUUID();
  let callsInSession = 0;
  let totalCost = 0;
  let upgraded = 0;
  let skippedNoImprovement = 0;

  for (let n = 0; n < targets.length; n++) {
    const { p, idx } = targets[n];
    const body = readFileSync(`${BODIES_DIR}/${p.id}.txt`, "utf-8");

    if (callsInSession >= CHUNK_SIZE) {
      sessionId = randomUUID();
      callsInSession = 0;
      console.log(`  [new chunk session ${sessionId.slice(0, 8)}…]`);
    }
    const isFirst = callsInSession === 0;

    process.stdout.write(`[${n + 1}/${targets.length}] ${p.id} (${p.locations.length} → ?)…`);
    const { cities, cost, cacheRead } = await extractCitiesViaClaude(body, sessionId, isFirst);
    callsInSession++;
    totalCost += cost;

    process.stdout.write(` LLM ${cities.length}개 (cost $${cost.toFixed(4)}, cache_read ${cacheRead})\n`);

    if (cities.length <= p.locations.length) {
      skippedNoImprovement++;
    } else {
      // Geocode new cities
      const newLocations: { name: string; lat: number; lng: number }[] = [];
      for (const c of cities) {
        const queryName = c.name_en || c.name_ko;
        const coords = await geocodeWithCache(queryName, geocodeCache);
        if (coords) {
          const displayName = c.name_en ? `${c.name_ko} (${c.name_en})` : c.name_ko;
          newLocations.push({ name: displayName, ...coords });
        }
      }

      // 퇴화 방지: geocode 실패로 새 결과가 짧아지면 기존 유지
      if (newLocations.length > p.locations.length) {
        packages[idx].locations = newLocations;
        upgraded++;
        console.log(`  ✓ ${p.locations.length} → ${newLocations.length} locations`);
      } else {
        skippedNoImprovement++;
        console.log(`  - skip (geocode 후 ${newLocations.length} <= 기존 ${p.locations.length})`);
      }
    }

    // LLM 호출 자체는 성공했으므로 hash 갱신 — 다음 주에 본문 안 바뀌면 skip
    if (cities.length > 0 && p.bodyHash) {
      packages[idx].lastLlmHash = p.bodyHash;
      packages[idx].lastLlmAt = new Date().toISOString();
    }

    // Intermediate save every 10 (prevents data loss on interrupt)
    if ((n + 1) % 10 === 0) {
      writeFileSync(PACKAGES_PATH, JSON.stringify(packages, null, 2));
      writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(geocodeCache, null, 2));
      console.log(`  [saved progress: ${n + 1}/${targets.length}, upgraded ${upgraded}]`);
    }
  }

  writeFileSync(PACKAGES_PATH, JSON.stringify(packages, null, 2));
  writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(geocodeCache, null, 2));

  console.log(`\nDone. Upgraded ${upgraded}, skipped ${skippedNoImprovement}, total LLM cost $${totalCost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
