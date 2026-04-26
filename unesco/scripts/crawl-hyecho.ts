/**
 * Best-effort Hyecho travel site crawler.
 * Run: npx tsx scripts/crawl-hyecho.ts
 * If this fails, use the manual hyecho-packages.json fallback.
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

async function crawlHyecho() {
  console.log("Attempting to fetch hyecho.com product data...");

  // Try simple fetch first (faster, no browser needed)
  try {
    const res = await fetch("https://www.hyecho.com/main?retRef=Y");
    const html = await res.text();
    console.log(`Fetched ${html.length} bytes from hyecho.com`);

    // Extract product links — this is best-effort, adapt as needed
    const productLinks = html.match(/href="[^"]*\/product\/[^"]*"/g) || [];
    console.log(`Found ${productLinks.length} product links`);

    if (productLinks.length === 0) {
      console.log("No products found via simple fetch. Site may be CSR-only.");
      console.log("Use the manual hyecho-packages.json fallback instead.");
      console.log("Or install playwright: npm install -D playwright && npx playwright install chromium");
    }
  } catch (e) {
    console.error("Fetch failed:", e);
    console.log("Use the manual hyecho-packages.json fallback.");
  }
}

crawlHyecho().catch(console.error);
