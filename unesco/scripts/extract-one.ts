// Spike: fetch a single product's bodyText via Playwright and save to /tmp/crawl-bodies.
// Usage: npx tsx /tmp/extract-one.ts hyecho-2750 hyecho-3260 hyecho-3277
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) { console.error("usage: extract-one.ts <id1> [id2 ...]"); process.exit(1); }
  mkdirSync("/tmp/crawl-bodies", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  for (const id of ids) {
    const seq = id.replace("hyecho-", "");
    const url = `https://www.hyecho.com/goods/goods_view?goodSeq=${seq}`;
    console.log(`fetching ${id} ← ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body.innerText);
    writeFileSync(`/tmp/crawl-bodies/${id}.txt`, body);
    console.log(`  ✓ saved ${body.length} chars`);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
