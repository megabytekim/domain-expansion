/**
 * Full Hyecho crawler using Playwright (CSR pages need browser rendering).
 * Run: cd unesco && npx tsx scripts/crawl-all-hyecho.ts
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PRODUCT_LIST = [
  {s:"2474",e:"",c:"trekking"},{s:"3089",e:"41997",c:"trekking"},{s:"2631",e:"41749",c:"trekking"},
  {s:"30000123",e:"30001685",c:"trekking"},{s:"3060",e:"41908",c:"trekking"},{s:"2806",e:"30000859",c:"trekking"},
  {s:"2422",e:"30000467",c:"trekking"},{s:"2475",e:"41691",c:"trekking"},{s:"3172",e:"41849",c:"trekking"},
  {s:"2486",e:"41699",c:"trekking"},{s:"2640",e:"30001635",c:"trekking"},{s:"3132",e:"30001859",c:"trekking"},
  {s:"2672",e:"30000908",c:"trekking"},{s:"2658",e:"41251",c:"trekking"},{s:"2895",e:"30000158",c:"trekking"},
  {s:"30000096",e:"30000900",c:"trekking"},{s:"2750",e:"",c:"trekking"},{s:"2489",e:"41712",c:"trekking"},
  {s:"2392",e:"42739",c:"trekking"},{s:"2388",e:"42000",c:"trekking"},{s:"2378",e:"42738",c:"trekking"},
  {s:"1951",e:"41819",c:"culture"},{s:"2082",e:"30000732",c:"culture"},{s:"1938",e:"41562",c:"culture"},
  {s:"1931",e:"42873",c:"culture"},{s:"2246",e:"42703",c:"culture"},{s:"1967",e:"42143",c:"culture"},
  {s:"2251",e:"41652",c:"culture"},{s:"1844",e:"41380",c:"culture"},{s:"1858",e:"41640",c:"culture"},
  {s:"30000064",e:"30000305",c:"culture"},{s:"2139",e:"42026",c:"culture"},{s:"1910",e:"41784",c:"culture"},
  {s:"2272",e:"41598",c:"culture"},{s:"1986",e:"41575",c:"culture"},{s:"1816",e:"30001392",c:"culture"},
  {s:"1992",e:"41561",c:"culture"},{s:"2273",e:"30001440",c:"culture"},{s:"1989",e:"",c:"culture"},
  {s:"2296",e:"42976",c:"culture"},{s:"1856",e:"41982",c:"culture"},{s:"1925",e:"42052",c:"culture"},
  {s:"1916",e:"41988",c:"culture"},
  {s:"3325",e:"",c:"walking"},{s:"30000099",e:"",c:"walking"},{s:"3347",e:"",c:"walking"},
  {s:"3361",e:"41655",c:"walking"},{s:"3360",e:"42652",c:"walking"},{s:"3351",e:"37511",c:"walking"},
  {s:"3109",e:"41893",c:"trekking"},
];

const GEOCODE_CACHE_PATH = resolve(__dirname, "../data/geocode-cache.json");
const OUTPUT_PATH = resolve(__dirname, "../data/hyecho-packages.json");

let geocodeCache: Record<string, { lat: number; lng: number } | null> = {};
if (existsSync(GEOCODE_CACHE_PATH)) {
  geocodeCache = JSON.parse(readFileSync(GEOCODE_CACHE_PATH, "utf-8"));
}

async function geocode(city: string): Promise<{ lat: number; lng: number } | null> {
  if (city in geocodeCache) return geocodeCache[city];
  await new Promise((r) => setTimeout(r, 1100));
  try {
    const q = encodeURIComponent(city);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "User-Agent": "hyecho-map-crawler/1.0" } }
    );
    const data = await res.json();
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[city] = result;
      return result;
    }
  } catch (e) {
    console.warn(`  Geocode error for "${city}"`);
  }
  geocodeCache[city] = null;
  return null;
}

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Auto-dismiss alert dialogs (e.g. "해당 행사는 이미 마감되었습니다.")
  page.on("dialog", (d) => d.accept());

  const results = [];
  let totalLocations = 0;

  for (let i = 0; i < PRODUCT_LIST.length; i++) {
    const p = PRODUCT_LIST[i];
    const url = p.e
      ? `https://www.hyecho.com/goods/goods_view?goodSeq=${p.s}&eventSeq=${p.e}`
      : `https://www.hyecho.com/goods/goods_view?goodSeq=${p.s}`;

    console.log(`\n[${i + 1}/${PRODUCT_LIST.length}] ${p.s}...`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2000);

      const data = await page.evaluate(() => {
        const title = document.title || "";
        if (!title || title === "혜초여행사") return null;

        const bodyText = document.body.innerText;

        // Price: find the first proper price (6+ digit number with commas)
        const priceMatch = bodyText.match(/([\d,]{7,})\s*원/);
        const price = priceMatch ? priceMatch[1] : "";

        // Duration from title
        const durMatch = title.match(/(\d+)\s*일/);
        const duration = durMatch ? durMatch[0] : "";

        // Main image from CDN
        let imageUrl = "";
        const imgs = document.querySelectorAll("img");
        for (const img of imgs) {
          const src = img.src || "";
          if (src.includes("cdn-www.hyecho.com") && src.includes("/goods/main/")) {
            imageUrl = src;
            break;
          }
        }

        // Extract cities from itinerary
        const lines = bodyText.split("\n").map((l) => l.trim());
        const cities = new Set<string>();
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.match(/^\d+일차$/)) continue;
          // Look at next few lines for "CityA - CityB" pattern
          for (let j = 1; j <= 4 && i + j < lines.length; j++) {
            const next = lines[i + j];
            if (next.includes(" - ") && next.length < 120 && !next.includes("[") && !next.includes("http")) {
              next.split(" - ").forEach((part) => {
                const city = part.trim();
                if (city.length > 1 && city.length < 30 && !city.match(/인천|공항|기내|도착|출발|\d{2}:\d{2}/)) {
                  cities.add(city);
                }
              });
              break;
            }
          }
        }

        return { title, price, duration, imageUrl, cities: Array.from(cities) };
      });

      if (!data) {
        console.log("  Skipped (no content)");
        continue;
      }

      console.log(`  ${data.title}`);
      console.log(`  Price: ₩${data.price}, Duration: ${data.duration}`);
      console.log(`  Cities (${data.cities.length}): ${data.cities.join(", ")}`);

      // Geocode cities
      const locations: { name: string; lat: number; lng: number }[] = [];
      for (const city of data.cities) {
        const coords = await geocode(city);
        if (coords) {
          locations.push({ name: city, ...coords });
          process.stdout.write(`  📍 ${city} `);
        } else {
          process.stdout.write(`  ❌ ${city} `);
        }
      }
      if (data.cities.length > 0) console.log();

      totalLocations += locations.length;

      results.push({
        id: `hyecho-${p.s}`,
        category: p.c,
        title: data.title,
        price: data.price,
        duration: data.duration,
        url,
        imageUrl: data.imageUrl,
        locations,
      });
    } catch (e: any) {
      console.error(`  Error: ${e.message}`);
    }

    // Save intermediate results every 10 products
    if ((i + 1) % 10 === 0) {
      writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(geocodeCache, null, 2));
      writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
      console.log(`  [saved ${results.length} products so far]`);
    }
  }

  await browser.close();

  writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(geocodeCache, null, 2));
  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nDone! ${results.length} products, ${totalLocations} total locations → ${OUTPUT_PATH}`);
}

main().catch(console.error);
