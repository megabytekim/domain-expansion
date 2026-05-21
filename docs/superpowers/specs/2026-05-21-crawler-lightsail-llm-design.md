# 크롤러 Lightsail 이전 + Claude Code LLM 추출

**Date**: 2026-05-21
**Status**: Design (사용자 검토 후 implementation plan으로 진입)
**계속 작업 위치**: AWS Lightsail 인스턴스 (Ubuntu 22.04+) 안의 Claude Code 세션

## Background

`unesco/scripts/crawl-all-hyecho.ts`는 매주 GitHub Actions에서 실행되며 hyecho.com에서 154개 패키지 데이터를 수집한다. 도시 추출 방식이 fragile해서 154개 중 **67개(43%)가 단일 location**, 7일+ 코스인데 도시 1개만 추출된 케이스가 **49개(전체의 32%)** 존재한다.

대표 사례:
- `[9일] 돌로미테 하이라이트 트레킹(OZ)` → "Dolomites" 1개
- `[16일] 무스탕 완전일주` → "Mustang" 1개
- `[43일] 산티아고 800KM 완주` → "Santiago" 1개
- `[12일] 알프스 뚜르 드 몽블랑(TMB)` → "Chamonix" 1개
- `[12일] 돌로미테 알타비아 No.1` → "베니스" 1개 (입국항만 잡힘)

### 누락 메커니즘 5가지

1. **HTML 구조 의존 fragility** — 추출이 `"^N일차$" 라인 뒤 4줄 안에 ' - ' 패턴` 휴리스틱에 의존. 페이지 마크업이 살짝만 달라져도 0개.
2. **enrich의 single-keyword fallback** — `enrich-locations.ts`는 title에 키워드 1개 매칭되면 좌표 1개 박음. 9일 코스의 9도시 정보가 영구 손실.
3. **Geocoder wrong-match** — "이란" → 마쓰모토(일본), "산호세" → California 등. 캐시되면 영구.
4. **항공사 코드 경유지 오추출** — (TK)→이스탄불, (EK)→두바이. 항공사 기반 제외 사전 없음.
5. **가격 first-match 버그** — bodyText에서 첫 번째 7+ 자리 숫자를 메인 가격으로 잡음. 페이지 상단의 "최저가 옵션 ₩3,500,000"이 메인 가격으로 추출된 시나이 1/3 케이스.

## Goals

1. 도시 추출 정확도 향상 — LLM(Claude Code)이 페이지 본문에서 실제 방문 도시 추출
2. 가격 sanity check (saleAmt와 cross-check)
3. 의심 케이스 자동 검출 → GitHub Issue 자동 발행
4. 인프라를 GitHub Actions → AWS Lightsail로 이전 (사용자 인프라 통합 의향)
5. Anthropic 비용 ~$3-$7/run — `claude --model haiku -p` + `--resume`으로 cache_read 재활용 + chunked sessions(15-20개/세션). Plan(Max 5x) OAuth 사용량 한도 안에서 카운트, API key 별도 청구 없음. *(검증 2026-05-21: dry call 3개 누적 비용 $0.19, call 1 $0.141 → call 2 $0.026 → call 3 $0.025 — `--resume`이 cache_read로 5-6× 절감)*

## Non-Goals

- 기존 정규식 추출 로직 완전 제거 — baseline으로 유지
- `enrich-locations.ts` 키워드 사전 폐기 — 마지막 fallback으로 유지
- UNESCO XML fetch 로직 변경
- 지도 UI 변경 (centroid/drill-in은 별도 spec에서 완료됨)

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ AWS Lightsail (Ubuntu 22.04+, RAM 1-2GB + swap 2GB)              │
│                                                                   │
│ Software:                                                         │
│   - Node 22 (via nvm)                                             │
│   - git + ~/.ssh/id_ed25519 (megabytekim deploy key)              │
│   - Playwright Chromium + system deps                             │
│   - Claude Code CLI + ~/.claude/ creds (사전 OAuth)                │
│   - Vercel CLI, gh CLI, jq                                        │
│                                                                   │
│ Layout:                                                           │
│   ~/domain-expansion/        (git clone, working repo)            │
│   ~/.env                     (chmod 600, secrets)                 │
│   ~/logs/                    (crawl 로그, 8주 보존)                │
│                                                                   │
│ systemd:                                                          │
│   unesco-crawl.timer    (OnCalendar 표현식으로 빈도 조절)          │
│   unesco-crawl.service  (oneshot, scripts/crawl.sh 실행)          │
└──────────────────────────────────────────────────────────────────┘
```

**핵심 디자인 결정**:
- 크롤 빈도는 systemd timer `OnCalendar`에서만 결정. 스크립트는 빈도 무관(weekly라는 단어 코드/파일명에서 제거).
- LLM 호출은 `execFile('claude', ['--model', 'haiku', '-p', '--output-format=json', '--json-schema', SCHEMA, '--resume', sessionId])` subprocess. OAuth(`~/.claude/`) 사용, API key 없음.
- **Session chunking**: conversation history가 haiku 200k context를 넘지 않도록 15-20개 호출마다 새 session-id로 chunk. 첫 호출(`--session-id <uuid>`)은 cache_creation 비용이 들고, 같은 chunk의 후속 호출(`--resume <uuid>`)은 cache_read로 5-6× 절감.
- **JSON Schema 사용**: `--json-schema` 옵션의 `structured_output` 필드 활용. spec 이전 버전의 `text.match(/\{[\s\S]*\}/)` regex 파싱은 폐기 (LLM 출력 fragility 회피).
- 기존 GitHub Actions는 `on.schedule` 제거 + `workflow_dispatch`만 남겨 비상용으로 보관.

## Components

### 1. Lightsail 환경 셋업 (one-time, 사용자가 직접 실행)

```bash
# Node 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.nvm/nvm.sh && nvm install 22

# Git + SSH (megabytekim 계정에 deploy key 등록)
ssh-keygen -t ed25519 -C "lightsail-unesco" -f ~/.ssh/id_ed25519
# id_ed25519.pub 내용을 GitHub megabytekim → Settings → SSH keys (또는 repo의 Deploy keys, write 권한)에 추가

# Repo clone
git clone git@github.com:megabytekim/domain-expansion.git ~/domain-expansion
cd ~/domain-expansion/unesco
npm ci

# Playwright Chromium
npx playwright install chromium --with-deps

# Claude Code CLI
# 정확한 패키지명은 implementation 단계에서 확인 (npm 또는 curl installer)
# 인증: 로컬 mac에서 OAuth 후 ~/.claude/ 디렉토리를 scp로 복사
# scp -r ~/.claude/ ubuntu@<lightsail-ip>:~/

# Vercel CLI, gh CLI
npm install -g vercel
sudo apt-get install gh

# Vercel 프로젝트 link (deploy 인증)
cd ~/domain-expansion/unesco
vercel link --project unesco --yes  # .vercel/ 생성
cd ~

# GitHub label 사전 생성 (validate-and-report.ts가 사용)
GH_TOKEN=$GITHUB_PAT gh label create crawler \
  --repo megabytekim/domain-expansion \
  --color "0075ca" \
  --description "크롤러 검출 의심 패키지" || true  # 이미 있으면 무시

# Swap (RAM 1GB 대비)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab

# ~/.env (chmod 600)
cat > ~/.env <<EOF
VERCEL_TOKEN=<vercel dashboard에서 발급>
GITHUB_PAT=<scope: repo + issues, megabytekim 계정 발급>
NEXT_PUBLIC_MAPTILER_KEY=<production env에서 복사>
EOF
chmod 600 ~/.env
```

### 2. scripts/crawl.sh (orchestrator)

위치: `unesco/scripts/crawl.sh`

```bash
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

source ~/.env
export VERCEL_TOKEN GITHUB_PAT NEXT_PUBLIC_MAPTILER_KEY

DRY_RUN=false
SKIP_LLM=false
PRODUCT_LIMIT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-llm) SKIP_LLM=true; shift ;;
    --products) PRODUCT_LIMIT=$2; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

LOG=~/logs/unesco-crawl-$(date +%Y-%m-%d_%H%M%S).log
mkdir -p ~/logs
exec >> "$LOG" 2>&1
echo "=== crawl.sh start $(date -Iseconds) dry=$DRY_RUN skip_llm=$SKIP_LLM ==="

git pull origin main
npm ci

# bodyText는 /tmp/crawl-bodies/{productId}.txt에 임시 캐시 (llm-extract.ts가 재사용)
npx tsx scripts/crawl-all-hyecho.ts ${PRODUCT_LIMIT:+--products $PRODUCT_LIMIT}
npx tsx scripts/fetch-unesco.ts

if [[ "$SKIP_LLM" == "false" ]]; then
  npx tsx scripts/llm-extract.ts
fi

npx tsx scripts/enrich-locations.ts

# Safety net — 진짜 사고만 잡고 정상 시즌 변동(±30%)은 통과
OLD=$(git show HEAD:unesco/data/hyecho-packages.json | jq 'length' 2>/dev/null || echo 0)
NEW=$(jq 'length' data/hyecho-packages.json)
EMPTY_LOC=$(jq '[.[] | select((.locations | length) == 0)] | length' data/hyecho-packages.json)

FAIL_REASON=""
if [[ "$NEW" -lt 30 ]]; then
  FAIL_REASON="absolute-floor: only $NEW packages"
elif [[ "$OLD" -gt 0 ]] && [[ "$NEW" -lt "$(( OLD * 50 / 100 ))" ]]; then
  FAIL_REASON="relative-drop: $NEW < 50% of $OLD"
elif [[ "$NEW" -gt 0 ]] && [[ "$(( EMPTY_LOC * 100 / NEW ))" -gt 50 ]]; then
  FAIL_REASON="extraction-failure: $EMPTY_LOC/$NEW packages have empty locations (>50%)"
fi

if [[ -n "$FAIL_REASON" ]]; then
  echo "FAIL: $FAIL_REASON — restoring"
  git checkout -- data/hyecho-packages.json
  exit 2
fi

npx tsx scripts/validate-and-report.ts

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY RUN — push & deploy skipped"
  exit 0
fi

if ! git diff --quiet -- data/; then
  git config user.email "lightsail-bot@hyecho.local"
  git config user.name "lightsail-bot"
  git add data/
  git commit -m "chore: data refresh $(date +%Y-%m-%d)"
  git push origin main
fi

vercel --prod --yes --token "$VERCEL_TOKEN"

# /tmp/crawl-bodies 정리
rm -rf /tmp/crawl-bodies

echo "=== crawl.sh end $(date -Iseconds) ==="
```

### 3. scripts/crawl-all-hyecho.ts 개조 (기존 보강)

**변경 1 — bodyText를 파일에 캐시** (LLM step이 재크롤 안 하도록):

`page.evaluate(...)` 반환값에 `bodyText` 추가, evaluate 후 파일로 저장. 또한 **main() 시작 시 stale bodies 정리**(이전 crawl 중간 fail 시 잔여 방지):

```ts
import { rmSync } from "fs";

// main() 시작
const bodiesDir = "/tmp/crawl-bodies";
rmSync(bodiesDir, { recursive: true, force: true });
mkdirSync(bodiesDir, { recursive: true });

// page.evaluate 반환값에 bodyText 추가
const data = await page.evaluate(() => {
  // ... 기존 추출 그대로 ...
  return { title, price, duration, imageUrl, cities, bodyText: document.body.innerText };
});

// 저장 (productId가 PRODUCT_LIST 루프 안에서 이미 계산되어 있음)
writeFileSync(`${bodiesDir}/${productId}.txt`, data.bodyText);
```

**변경 2 — `--products N` 인자 지원** (dry-run 시 소수만 처리):

```ts
const limitArg = process.argv.indexOf("--products");
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
const targets = PRODUCT_LIST.slice(0, Math.min(PRODUCT_LIST.length, LIMIT));
// for 루프를 targets 기반으로
```

### 4. scripts/llm-extract.ts (신규)

목적: 각 product의 본문을 Claude Code `-p`에 전달해 구조화된 cities 추출.

```ts
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const execFileP = promisify(execFile);
const PACKAGES_PATH = resolve(__dirname, "../data/hyecho-packages.json");
const GEOCODE_CACHE_PATH = resolve(__dirname, "../data/geocode-cache.json");
const BODIES_DIR = "/tmp/crawl-bodies";

const SYSTEM_PROMPT = `당신은 한국 여행사 패키지 페이지에서 실제 "방문 도시" 목록을 추출합니다.

[포함]
- 실제 머무르거나 관광하는 도시 (호텔 체크인/관광 일정 있는 도시)
- 트레킹 루트의 거점 (예: 카트만두, 포카라, 안나푸르나 베이스캠프)

[제외]
- 한국 출발/도착 공항 (인천, 김포)
- 단순 경유 도시 (괄호 안 "(경유)" 표시, 또는 항공사 코드 (TK)/(EK) 패턴의 환승 도시)
- 랜드마크/시설명 (~궁전, ~박물관, ~광장, ~모스크, ~사원, ~대성당, ~전망대)
- 기내, 호텔, 식사 같은 일반 명사

출력은 strict JSON, 다른 텍스트 없이:
{"cities": [{"name_ko": "두브로브니크", "name_en": "Dubrovnik", "confidence": "high"}]}

confidence는 high/medium/low. 본문에 명확한 일정 표시면 high, 추론이면 medium, 모호하면 low.
low는 사용하지 않을 거니까 정말 자신 없을 때만.`;

interface LlmCity {
  name_ko: string;
  name_en?: string;
  confidence: "high" | "medium" | "low";
}

async function extractCities(body: string): Promise<LlmCity[]> {
  const prompt = `${SYSTEM_PROMPT}\n\n---\n페이지 본문:\n${body.slice(0, 8000)}`;
  try {
    const { stdout } = await execFileP("claude", ["-p", "--output-format=json"], {
      input: prompt,
      maxBuffer: 1024 * 1024 * 4,
      timeout: 60_000,
    });
    // claude -p --output-format=json 출력 구조는 implementation 단계에서 정확히 확인.
    // 예상: { result: "...JSON text..." } 또는 직접 { cities: [...] }
    const outer = JSON.parse(stdout);
    const text = typeof outer.result === "string" ? outer.result
                : typeof outer.content === "string" ? outer.content
                : stdout;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const data = JSON.parse(match[0]);
    const cities: LlmCity[] = Array.isArray(data.cities) ? data.cities : [];
    return cities.filter(c => c.confidence !== "low" && c.name_ko);
  } catch (e: any) {
    console.warn(`  LLM 실패: ${e.message}`);
    return [];
  }
}

// (geocode 함수는 crawl-all-hyecho.ts와 동일한 cache 공유)

async function main() {
  const packages = JSON.parse(readFileSync(PACKAGES_PATH, "utf-8"));
  const geocodeCache = existsSync(GEOCODE_CACHE_PATH)
    ? JSON.parse(readFileSync(GEOCODE_CACHE_PATH, "utf-8"))
    : {};

  // 병렬 5개 (Max 5x plan rate limit 안전 마진)
  const CONCURRENCY = 5;
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < packages.length) {
      const i = idx++;
      const p = packages[i];
      const bodyPath = `${BODIES_DIR}/${p.id}.txt`;
      if (!existsSync(bodyPath)) continue;
      const body = readFileSync(bodyPath, "utf-8");
      const llmCities = await extractCities(body);
      console.log(`[${i+1}/${packages.length}] ${p.id} → LLM ${llmCities.length}개`);

      if (llmCities.length === 0) continue;

      // Merge 규칙:
      //   LLM 결과 길이 > 기존 locations 길이 → LLM 우선 (단, geocode 성공한 게 기존보다 많을 때만)
      if (llmCities.length > p.locations.length) {
        const newLocations: any[] = [];
        for (const c of llmCities) {
          const queryName = c.name_en || c.name_ko;
          const coords = await geocodeWithCache(queryName, geocodeCache);
          if (coords) {
            const displayName = c.name_en
              ? `${c.name_ko} (${c.name_en})`
              : c.name_ko;
            newLocations.push({ name: displayName, ...coords });
          }
        }
        // P4 fix: geocode 실패로 기존보다 짧아진 경우 교체 X
        if (newLocations.length > p.locations.length) {
          p.locations = newLocations;
        }
      }
    }
  });
  await Promise.all(workers);

  writeFileSync(PACKAGES_PATH, JSON.stringify(packages, null, 2));
  writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(geocodeCache, null, 2));
  console.log("LLM extraction complete.");
}

// P3 fix: Nominatim은 1 req/sec/IP. concurrency 5 worker가 동시 호출하면 위반.
// 전역 mutex로 직렬화 + 호출 간 1.1초 간격 보장.
let geocodeChain: Promise<unknown> = Promise.resolve();
async function geocodeWithCache(name: string, cache: Record<string, any>) {
  if (name in cache) return cache[name];
  // 직전 호출이 끝날 때까지 대기 (다른 worker도 같은 chain에 enqueue)
  const myTurn = geocodeChain.then(async () => {
    if (name in cache) return cache[name];  // 대기 중 다른 worker가 캐시했을 수도
    await new Promise(r => setTimeout(r, 1100));  // Nominatim 1 req/sec
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
      { headers: { "User-Agent": "hyecho-map-crawler/1.0" } }
    );
    const data = await res.json();
    const result = data.length > 0
      ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      : null;
    cache[name] = result;
    return result;
  });
  geocodeChain = myTurn.catch(() => {});  // 한 호출 실패가 다음 호출을 막지 않음
  return myTurn;
}

main().catch(console.error);
```

### 5. scripts/validate-and-report.ts (신규)

목적: 의심 케이스 검출 + GitHub Issue 자동 발행.

```ts
import { readFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";

const execFileP = promisify(execFile);
const PACKAGES_PATH = resolve(__dirname, "../data/hyecho-packages.json");

interface Suspicious {
  productId: string;
  title: string;
  url: string;
  reason: "long-duration-single-city" | "price-1-3-pattern" | "landmark-as-city";
  detail: string;
}

function detect(packages: any[]): Suspicious[] {
  const flags: Suspicious[] = [];
  const NOISE = /궁전|박물관|광장|모스크|대성당|전망대|사원/;

  for (const p of packages) {
    const days = parseInt(p.duration?.match(/(\d+)/)?.[1] || "0", 10);

    // 1. 7일+ 단일 도시
    if (days >= 7 && p.locations.length === 1) {
      flags.push({
        productId: p.id, title: p.title, url: p.url,
        reason: "long-duration-single-city",
        detail: `${days}일 코스인데 location 1개 (${p.locations[0]?.name})`,
      });
    }

    // 2. 가격 sanity check
    const price = parseInt(p.price?.replace(/,/g, "") || "0", 10);
    const departures = p.departures || [];
    if (departures.length > 0 && price > 0) {
      const sales = departures.map((d: any) => d.saleAmt).filter((s: number) => s > 0);
      if (sales.length > 0) {
        const minSale = Math.min(...sales);
        if (price < minSale * 0.5) {
          flags.push({
            productId: p.id, title: p.title, url: p.url,
            reason: "price-1-3-pattern",
            detail: `price=₩${price.toLocaleString()} vs min saleAmt=₩${minSale.toLocaleString()} (price < 50% of min)`,
          });
        }
      }
    }

    // 3. 랜드마크 키워드가 도시 후보에 포함
    for (const loc of p.locations || []) {
      if (NOISE.test(loc.name)) {
        flags.push({
          productId: p.id, title: p.title, url: p.url,
          reason: "landmark-as-city",
          detail: `location 후보에 랜드마크: ${loc.name}`,
        });
      }
    }
  }
  return flags;
}

async function createIssue(flags: Suspicious[]) {
  const PAT = process.env.GITHUB_PAT;
  if (!PAT || flags.length === 0) return;

  const date = new Date().toISOString().slice(0, 10);
  const grouped: Record<string, Suspicious[]> = {};
  for (const f of flags) (grouped[f.reason] ||= []).push(f);

  let body = `## 자동 검출된 의심 패키지: ${flags.length}개\n\n`;
  for (const [reason, items] of Object.entries(grouped)) {
    body += `### ${reason} (${items.length}개)\n\n`;
    for (const f of items) {
      body += `- **${f.productId}** — ${f.title}\n  - ${f.detail}\n  - [페이지](${f.url})\n\n`;
    }
  }
  body += `\n---\n*[crawl run ${new Date().toISOString()}] validate-and-report.ts*`;

  await execFileP("gh", [
    "issue", "create",
    "--repo", "megabytekim/domain-expansion",
    "--title", `[crawl-warning ${date}] ${flags.length}개 의심 패키지`,
    "--body", body,
    "--label", "crawler",
  ], { env: { ...process.env, GH_TOKEN: PAT } });
}

async function main() {
  const packages = JSON.parse(readFileSync(PACKAGES_PATH, "utf-8"));
  const flags = detect(packages);
  console.log(`Suspicious detected: ${flags.length}`);
  for (const f of flags.slice(0, 20)) {
    console.log(`  - ${f.productId} [${f.reason}] ${f.detail}`);
  }
  await createIssue(flags);
}

main().catch(console.error);
```

### 6. systemd unit 파일

`/etc/systemd/system/unesco-crawl.service`:
```ini
[Unit]
Description=Hyecho crawler run
After=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/domain-expansion/unesco
ExecStart=/home/ubuntu/domain-expansion/unesco/scripts/crawl.sh
StandardOutput=journal
StandardError=journal
TimeoutStartSec=3600
```

`/etc/systemd/system/unesco-crawl.timer`:
```ini
[Unit]
Description=Run unesco crawl on schedule

[Timer]
# 빈도는 여기서만 조절. 매주 월요일 00:00 UTC 예시:
OnCalendar=Mon *-*-* 00:00:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

활성화:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now unesco-crawl.timer
systemctl list-timers unesco-crawl.timer
journalctl -u unesco-crawl.service -f  # 로그 follow
```

빈도 변경 예시:
- 매일 자정 KST: `OnCalendar=*-*-* 15:00:00 UTC`
- 매 6시간: `OnCalendar=0/6:00:00`
- 매시간: `OnCalendar=*:00:00`

### 7. 기존 GitHub Actions 처리

`.github/workflows/crawl.yml` 수정:
- `on.schedule` 블록 제거 → `workflow_dispatch`만 남김
- 워크플로우 본문은 보관 (Lightsail 다운 시 수동 실행 비상 수단)

## Data Flow

```
hyecho.com 페이지 (Playwright)
   │
   ├─→ /tmp/crawl-bodies/{productId}.txt   (LLM step 재사용)
   └─→ packages.json 1차 (rule-based 정규식 결과)
       │
       ▼
   llm-extract.ts: bodies/*.txt → claude -p → cities JSON
       │  (confidence=low 필터링, LLM 결과 길이 > 기존이면 LLM 우선)
       ▼
   packages.json 2차 (LLM 보강)
       │
       ▼
   enrich-locations.ts: 여전히 0개면 키워드 사전 fallback
       │
       ▼
   80% threshold 검증
       │ FAIL → git checkout으로 복원, exit 2
       │ OK ↓
       ▼
   validate-and-report.ts: suspicious 검출
       │
       ├─→ GitHub Issue 발행 (gh CLI + GITHUB_PAT)
       └─→ stdout 요약
       │
       ▼
   git commit & push origin main (SSH key)
       │
       ▼
   vercel --prod --yes --token VERCEL_TOKEN
       │
       ▼
   /tmp/crawl-bodies 정리
```

## Merge 규칙 (LLM vs rule-based)

| 케이스 | 결과 |
|---|---|
| LLM 0개, rule-based N개 | rule-based 유지 |
| LLM 길이 ≤ rule-based 길이 | rule-based 유지 |
| LLM 길이 > rule-based 길이, **geocode 후도 > rule-based** | LLM으로 교체 |
| LLM 길이 > rule-based 길이, **geocode 실패로 ≤ rule-based** | rule-based 유지 (퇴화 방지) |
| LLM 결과 중 confidence=low | 제외 |
| 둘 다 0개 | `enrich-locations.ts`가 키워드 fallback 시도 |

## Error Handling

| 실패 지점 | 처리 |
|---|---|
| Playwright fetch | 기존 retry 3회 (exp backoff) |
| LLM 호출 timeout/parse 실패 | 그 product skip, rule-based 결과 유지, 로그 |
| Geocode (Nominatim) | null 캐시, enrich가 후처리 |
| 80% threshold fail | `git checkout`으로 이전 데이터 복원, exit 2 |
| git push 충돌 | rebase 시도, 실패 시 systemd unit fail |
| vercel deploy 실패 | exit code 별도, journal 로그. (이전 prod 그대로 유지됨) |
| systemd unit fail | `journalctl -u unesco-crawl` 확인, 다음 cron tick에 재시도 |

## Migration Plan

1. **Lightsail 환경 셋업** (1-2시간) — 위 Components 1번
2. **Code 신규 추가** (Lightsail의 claude 세션에서)
   - `scripts/crawl.sh` (실행권 700)
   - `scripts/llm-extract.ts`
   - `scripts/validate-and-report.ts`
   - `scripts/crawl-all-hyecho.ts` 개조 (bodyText 저장, --products 인자)
3. **Dry run #1** — 소수 패키지 검증
   ```bash
   ./scripts/crawl.sh --dry-run --products 10
   # 결과: data/hyecho-packages.json git diff 확인
   ```
4. **Dry run #2** — 전체 154개, push/deploy skip
   ```bash
   ./scripts/crawl.sh --dry-run
   # LLM 추출이 rule-based보다 얼마나 개선했는지 sample 10개 수동 검토
   ```
5. **첫 실 운영** — 수동 실행 + production 배포
   ```bash
   ./scripts/crawl.sh
   # unesco-delta.vercel.app에서 변경 확인
   ```
6. **systemd timer 활성화** — Components 6번
7. **GH Actions 비활성화** — `.github/workflows/crawl.yml`의 `on.schedule` 제거, commit & push

## Out of Scope

- UNESCO XML 데이터 보강
- 지도 UI 변경 (centroid/drill-in 등은 별도 spec에서 완료)
- 다른 cron 작업의 Lightsail 통합 — 필요해지면 별도 spec
- Slack/이메일 알림 — 1주차 운영 후 필요시 별도 작업
- Hyecho 사이트의 robots.txt/ToS 검토 — 기존 크롤도 했으니 동일 기준

## Open Questions (implementation 단계에서 확인)

implementation은 Lightsail의 claude 세션에서 이어 작업할 예정. 거기서 확인할 것들:

1. **Claude Code CLI 설치 방식** — `npm install -g @anthropic-ai/claude-code` 인지, brew 인지, curl installer 인지. (Anthropic 공식 문서 확인) ✅ **resolved 2026-05-21: 이 환경에 `/usr/bin/claude` (2.1.142) 설치됨**
2. ~~**`claude -p --output-format=json` 실제 출력 구조**~~ ✅ **resolved 2026-05-21**: 단일 응답은 top-level `{type:"result",result:"...",total_cost_usd:N,...}`. `--json-schema` 사용 시 `structured_output` 필드에 schema 검증된 JSON 객체. spec의 fragile regex parsing 폐기 → `outer.structured_output.cities` 직접 사용.
3. **Claude Code headless 인증** — 로컬 OAuth 후 `~/.claude/` 디렉토리만 복사하면 충분한지, refresh token 만료 시 갱신 흐름.
4. **Plan Max 5x rate limit 실시간 동작** — 154개 한 번에 처리 중 429/limit 반환 시 자동 backoff/대기 동작.
5. **Playwright + Chromium + Node + Claude CLI subprocess 동시 실행 시 메모리** — swap 2GB로 충분한지 dry run에서 `free -h` + `dmesg`로 확인. 부족하면 swap 늘리거나 인스턴스 upgrade.
6. **gh CLI 인증 방식** — `GH_TOKEN` env로 충분한지, `gh auth login --with-token` 별도 필요한지.
7. **Claude CLI subprocess 동시 5개 실행 안정성** — `~/.claude/` creds 디렉토리 동시 접근 시 lock 충돌 가능성. 첫 dry run에서 concurrency=1로 시도 후 5로 올려서 검증.
8. **VERCEL_TOKEN scope** — 전체 권한 token보다 project-scoped token 권장(Vercel Tokens 페이지에서 unesco 프로젝트로 제한). 보안 강화.
9. ~~**LLM JSON 파싱의 fragility**~~ ✅ **resolved 2026-05-21**: `--json-schema` 옵션으로 strict structured output 강제. LLM 출력이 schema 어기면 CLI 단에서 빈 `structured_output` 반환. regex 파싱 폐기.

10. ✅ **resolved 2026-05-21 — `--resume`으로 cache 재활용**: 같은 session-id로 후속 호출하면 cache_read로 처리되어 5-6× 절감. 다만 conversation history가 turn마다 ~6k tokens 추가되므로 haiku 200k context 안전 마진 위해 **15-20개 호출마다 새 session-id로 chunk**.

## Implementation 진행 상황 (2026-05-21)

✅ **branch `crawler-lightsail-llm`에 구현 + dry run 1회 완료**:
- `scripts/crawl-all-hyecho.ts`: bodyText `/tmp/crawl-bodies/{id}.txt` 저장 + `--products N` 인자 + locations ≤ 1 재크롤
- `scripts/llm-extract.ts`: haiku + `--json-schema` + `--resume` chunked sessions + Nominatim mutex
- `scripts/validate-and-report.ts`: long-duration-single-city / price-1-3-pattern / landmark-as-city + gh CLI Issue 발행
- `scripts/crawl.sh`: orchestrator + safety net 4-검사
- 환경: claude CLI 2.1.142, Playwright chromium-1217, jq 1.6, gh 2.4.0

### Dry run (--products 5)에서 확인된 사실
- llm-extract `--json-schema` strict output: 동작 ✅
- session `--resume` cache_read 재활용: 5-6× 절감 ✅
- single-location 1개 → 10개 확장: 동작 ✅ (센다이 → 동북 트레킹 일정 순서 정확)
- safety net + validate-and-report: 49건 단일 도시 정확 검출 ✅

### 미해결 / 다음 라운드
- `fetch-unesco.ts` HTTP 403 — UNESCO XML 서버 차단/URL 변경 (별개 이슈)
- 첫 실 dry run (`--dry-run` 전체) — single-location 67개 재크롤 + LLM 비용/시간 측정
- systemd unit/timer 활성화 + GitHub Actions `on.schedule` 비활성화
- `~/.env` GITHUB_PAT 정리 (Issue 자동 발행용)

## 참고: 현재 데이터 통계 (2026-05-21 스냅샷)

| locations 수 | 패키지 수 | 비율 |
|---|---|---|
| 1 | 67 | 43% |
| 2 | 31 | 20% |
| 3 | 24 | 16% |
| 4+ | 32 | 21% |

총 154개 (이 숫자는 **스냅샷이며 시즌·신상품 출시에 따라 ±30% 변동 가능**). safety net의 절대 floor(30개) + 상대 50% 임계는 이 변동성을 고려해 설정.

7일+ 단일 도시 (누락 강력 의심): **49개 / 32%**.

성공 기준: LLM 도입 후 단일 도시 비율이 43% → 20% 이하로 감소, 7일+ 단일 도시는 32% → 10% 이하.
