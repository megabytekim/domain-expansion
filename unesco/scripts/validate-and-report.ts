/**
 * 의심 패키지 자동 검출 + GitHub Issue 자동 발행.
 *
 * 검출 규칙:
 *   1. long-duration-single-city — 7일+ 코스인데 locations 1개 (도시 추출 누락 강력 의심)
 *   2. price-1-3-pattern         — product.price가 min(saleAmt)의 50% 미만 (시나이형 가격 누락)
 *   3. landmark-as-city          — locations 후보에 명백한 랜드마크 (궁전/박물관/광장/모스크/사원/대성당/전망대)
 *
 * 결과:
 *   - stdout 요약
 *   - GH_TOKEN env가 있으면 `crawler` 라벨로 GitHub Issue 자동 발행
 *
 * 실패해도 crawl.sh의 다음 step(배포)을 막지 않음 (best-effort 모니터링).
 */

import { readFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";

const execFileP = promisify(execFile);
const PACKAGES_PATH = resolve(__dirname, "../data/hyecho-packages.json");
const REPO = "megabytekim/domain-expansion";
const LANDMARK_RE = /궁전|박물관|광장|모스크|사원|대성당|전망대|기념관|기념비/;

type Reason = "long-duration-single-city" | "price-1-3-pattern" | "landmark-as-city";

interface Flag {
  productId: string;
  title: string;
  url: string;
  reason: Reason;
  detail: string;
}

function detect(packages: any[]): Flag[] {
  const flags: Flag[] = [];

  for (const p of packages) {
    const days = parseInt(p.duration?.match(/(\d+)/)?.[1] || "0", 10);

    // 1. 7일+ 단일 도시
    if (days >= 7 && (p.locations?.length ?? 0) === 1) {
      flags.push({
        productId: p.id,
        title: p.title,
        url: p.url,
        reason: "long-duration-single-city",
        detail: `${days}일 코스인데 location 1개 (${p.locations[0]?.name})`,
      });
    }

    // 2. 가격 sanity (product.price << min(saleAmt))
    const price = parseInt((p.price || "0").replace(/,/g, ""), 10);
    const departures = p.departures || [];
    if (departures.length > 0 && price > 0) {
      const sales: number[] = departures
        .map((d: any) => d.saleAmt)
        .filter((s: number) => typeof s === "number" && s > 0);
      if (sales.length > 0) {
        const minSale = Math.min(...sales);
        if (price < minSale * 0.5) {
          flags.push({
            productId: p.id,
            title: p.title,
            url: p.url,
            reason: "price-1-3-pattern",
            detail: `price=₩${price.toLocaleString()} vs min saleAmt=₩${minSale.toLocaleString()} (price < 50% of min)`,
          });
        }
      }
    }

    // 3. 랜드마크 키워드가 도시 후보에 포함
    for (const loc of p.locations || []) {
      if (LANDMARK_RE.test(loc.name)) {
        flags.push({
          productId: p.id,
          title: p.title,
          url: p.url,
          reason: "landmark-as-city",
          detail: `location에 랜드마크: ${loc.name}`,
        });
      }
    }
  }
  return flags;
}

function summary(packages: any[], flags: Flag[]): string {
  const empty = packages.filter((p) => (p.locations?.length ?? 0) === 0).length;
  const single = packages.filter((p) => (p.locations?.length ?? 0) === 1).length;
  return [
    `Packages: ${packages.length}`,
    `  - locations=0:  ${empty}`,
    `  - locations=1:  ${single}`,
    `Flags: ${flags.length}`,
  ].join("\n");
}

async function createIssue(flags: Flag[]): Promise<void> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_PAT;
  if (!token) {
    console.log("(GH_TOKEN/GITHUB_PAT 없음 — Issue 발행 skip)");
    return;
  }
  if (flags.length === 0) {
    console.log("의심 패키지 없음 — Issue 발행 skip");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const grouped: Record<string, Flag[]> = {};
  for (const f of flags) (grouped[f.reason] ||= []).push(f);

  let body = `## 자동 검출된 의심 패키지: ${flags.length}건\n\n`;
  for (const [reason, items] of Object.entries(grouped)) {
    body += `### ${reason} (${items.length}건)\n\n`;
    for (const f of items) {
      body += `- **${f.productId}** — ${f.title}\n  - ${f.detail}\n  - [페이지](${f.url})\n\n`;
    }
  }
  body += `\n---\n*[crawl run ${new Date().toISOString()}] scripts/validate-and-report.ts*`;

  try {
    await execFileP(
      "gh",
      [
        "issue", "create",
        "--repo", REPO,
        "--title", `[crawl-warning ${date}] ${flags.length}건 의심 패키지`,
        "--body", body,
        "--label", "crawler",
      ],
      { env: { ...process.env, GH_TOKEN: token } },
    );
    console.log(`GitHub Issue 발행 완료 (${flags.length}건)`);
  } catch (e: any) {
    console.warn(`Issue 발행 실패: ${e.message?.slice(0, 200)}`);
    if (e.stderr) console.warn(`  stderr: ${String(e.stderr).slice(0, 300)}`);
  }
}

async function main() {
  const packages: any[] = JSON.parse(readFileSync(PACKAGES_PATH, "utf-8"));
  const flags = detect(packages);

  console.log(summary(packages, flags));
  console.log();

  // 상위 20건만 stdout
  for (const f of flags.slice(0, 20)) {
    console.log(`  - ${f.productId} [${f.reason}] ${f.detail}`);
  }
  if (flags.length > 20) console.log(`  ... (${flags.length - 20}건 더)`);

  await createIssue(flags);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
