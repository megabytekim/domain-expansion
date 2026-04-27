/**
 * Full Hyecho crawler using Playwright (CSR pages need browser rendering).
 * Run: cd unesco && npx tsx scripts/crawl-all-hyecho.ts
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PRODUCT_LIST = [
  // === EXISTING 50 ===
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
  // === NEW 105 from subcategory crawl ===
  // Trekking - Europe (TA)
  {s:"3028",e:"41897",c:"trekking"},{s:"3078",e:"42001",c:"trekking"},
  {s:"3030",e:"41855",c:"trekking"},{s:"3029",e:"41858",c:"trekking"},
  // Trekking - Nepal (TB)
  {s:"2763",e:"42707",c:"trekking"},{s:"2639",e:"42748",c:"trekking"},
  // Trekking - Tibet/India/Pakistan (TC)
  {s:"2632",e:"41602",c:"trekking"},{s:"2618",e:"41773",c:"trekking"},
  {s:"2599",e:"42004",c:"trekking"},{s:"2616",e:"42084",c:"trekking"},
  {s:"30000054",e:"30000038",c:"trekking"},
  // Trekking - China (TD)
  {s:"30000104",e:"30000839",c:"trekking"},{s:"2476",e:"41738",c:"trekking"},
  {s:"2477",e:"41952",c:"trekking"},
  // Trekking - Japan (TE)
  {s:"2809",e:"",c:"trekking"},{s:"2920",e:"30000240",c:"trekking"},
  {s:"2899",e:"30000085",c:"trekking"},{s:"2854",e:"30000273",c:"trekking"},
  {s:"2940",e:"30000115",c:"trekking"},
  // Trekking - Americas (TF)
  {s:"3198",e:"",c:"trekking"},{s:"3184",e:"",c:"trekking"},{s:"3204",e:"41951",c:"trekking"},
  // Trekking - South America (TG)
  {s:"3232",e:"30000586",c:"trekking"},{s:"3270",e:"30000719",c:"trekking"},
  {s:"3230",e:"30001742",c:"trekking"},{s:"3260",e:"42971",c:"trekking"},
  // Trekking - Central Asia/Mongolia/Russia (TH)
  {s:"2472",e:"30000767",c:"trekking"},{s:"2409",e:"",c:"trekking"},
  {s:"2415",e:"",c:"trekking"},{s:"2466",e:"42036",c:"trekking"},
  {s:"2467",e:"30000314",c:"trekking"},{s:"30000134",e:"30001718",c:"trekking"},
  // Trekking - Southeast Asia (TI)
  {s:"3130",e:"41667",c:"trekking"},{s:"3133",e:"",c:"trekking"},
  // Trekking - Africa/Middle East (TJ)
  {s:"30000067",e:"",c:"trekking"},
  // Trekking - Peak climbing (TK)
  {s:"3118",e:"41378",c:"trekking"},{s:"2390",e:"30001681",c:"trekking"},
  // Trekking - NZ/Australia (TL)
  {s:"30000105",e:"30000874",c:"trekking"},{s:"2778",e:"30000596",c:"trekking"},
  {s:"2792",e:"30000830",c:"trekking"},{s:"2798",e:"30000753",c:"trekking"},
  {s:"2796",e:"42946",c:"trekking"},
  // Trekking - Companion (TM)
  {s:"3076",e:"41836",c:"trekking"},{s:"3277",e:"40947",c:"trekking"},
  // Trekking - Easy (TN)
  {s:"3162",e:"",c:"trekking"},{s:"3114",e:"",c:"trekking"},
  // Culture - India/Nepal/Sri Lanka (MA)
  {s:"2010",e:"40478",c:"culture"},{s:"2019",e:"41865",c:"culture"},
  {s:"2007",e:"41138",c:"culture"},{s:"2027",e:"",c:"culture"},
  {s:"2005",e:"30001206",c:"culture"},
  // Culture - China (MB)
  {s:"1929",e:"42067",c:"culture"},{s:"1903",e:"41554",c:"culture"},
  {s:"1859",e:"41885",c:"culture"},{s:"1853",e:"41877",c:"culture"},
  // Culture - Tibet/Bhutan/Pakistan (MC)
  {s:"2247",e:"41358",c:"culture"},{s:"2268",e:"41339",c:"culture"},
  {s:"2256",e:"41480",c:"culture"},{s:"2270",e:"41862",c:"culture"},
  // Culture - Europe (MD)
  {s:"1973",e:"",c:"culture"},{s:"1978",e:"",c:"culture"},
  {s:"1990",e:"",c:"culture"},{s:"1991",e:"41801",c:"culture"},
  {s:"30000072",e:"42017",c:"culture"},{s:"1962",e:"42074",c:"culture"},
  // Culture - Japan (ME)
  {s:"1819",e:"",c:"culture"},{s:"1792",e:"",c:"culture"},
  {s:"30000094",e:"",c:"culture"},
  // Culture - Africa/Egypt/Morocco (MF)
  {s:"1767",e:"",c:"culture"},{s:"1777",e:"",c:"culture"},
  {s:"1770",e:"30001266",c:"culture"},{s:"1734",e:"30000577",c:"culture"},
  {s:"1775",e:"30001765",c:"culture"},{s:"1761",e:"42930",c:"culture"},
  // Culture - Americas (MG)
  {s:"2274",e:"42111",c:"culture"},{s:"2276",e:"42406",c:"culture"},
  {s:"2277",e:"42832",c:"culture"},{s:"2275",e:"42868",c:"culture"},
  // Culture - Central Asia (MH)
  {s:"2279",e:"40331",c:"culture"},{s:"2294",e:"42070",c:"culture"},
  {s:"2303",e:"42934",c:"culture"},{s:"2286",e:"30000503",c:"culture"},
  // Culture - SE Asia (MI)
  {s:"30000053",e:"41502",c:"culture"},{s:"1846",e:"41288",c:"culture"},
  {s:"1832",e:"42395",c:"culture"},
  // Culture - NZ/Australia (MJ)
  {s:"2142",e:"",c:"culture"},{s:"2127",e:"42055",c:"culture"},
  // Culture - Japan culture (MK)
  {s:"2080",e:"41117",c:"culture"},{s:"2077",e:"41760",c:"culture"},
  {s:"2089",e:"30000304",c:"culture"},{s:"2079",e:"30000282",c:"culture"},
  {s:"2081",e:"30000855",c:"culture"},{s:"2054",e:"30000911",c:"culture"},
  {s:"2058",e:"30001880",c:"culture"},
  // Culture - Mongolia/Russia (ML)
  {s:"2144",e:"41569",c:"culture"},{s:"1830",e:"42928",c:"culture"},
  {s:"2143",e:"42991",c:"culture"},
  // Culture - Cruises (MN)
  {s:"2087",e:"40368",c:"culture"},
  // Walking - additional
  {s:"3364",e:"30000709",c:"walking"},{s:"3350",e:"42651",c:"walking"},
  {s:"30000117",e:"30001817",c:"walking"},{s:"30000074",e:"",c:"walking"},
  {s:"30000098",e:"30000711",c:"walking"},
  // Events
  {s:"30000063",e:"30000573",c:"event"},{s:"2942",e:"30000150",c:"event"},
];

const GEOCODE_CACHE_PATH = resolve(__dirname, "../data/geocode-cache.json");
const OUTPUT_PATH = resolve(__dirname, "../data/hyecho-packages.json");

let geocodeCache: Record<string, { lat: number; lng: number } | null> = {};
if (existsSync(GEOCODE_CACHE_PATH)) {
  geocodeCache = JSON.parse(readFileSync(GEOCODE_CACHE_PATH, "utf-8"));
}

const HYECHO_BASE = "https://www.hyecho.com";
const HYECHO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; hyecho-map/1.0)" };

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** fetch with timeout + exponential-backoff retry */
async function fetchWithRetry(url: string, retries = 3, baseDelay = 1200): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: HYECHO_HEADERS });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e: any) {
      clearTimeout(timer);
      if (i === retries - 1) throw e;
      const delay = baseDelay * 2 ** i + Math.random() * 600;
      console.warn(`  ↻ retry ${i + 1}/${retries} (${Math.round(delay)}ms): ${e.message}`);
      await sleep(delay);
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

/** 상품의 전체 향후 출발일 데이터를 API 2단계로 수집 */
async function fetchDepartures(goodSeq: string) {
  const departures: any[] = [];
  try {
    // 1단계: 출발 월 목록
    await sleep(400 + Math.random() * 400);
    const monthRes = await fetchWithRetry(
      `${HYECHO_BASE}/goods/getGoodsEventMonthList.json?goodSeq=${goodSeq}`
    );
    const monthData = await monthRes.json();
    if (monthData.message !== "SUCCESS" || !monthData.list?.length) return departures;

    // 2단계: 월별 출발일 상세
    for (const month of monthData.list) {
      await sleep(500 + Math.random() * 400); // 500-900ms per month (rate limit 방지)
      try {
        const evRes = await fetchWithRetry(
          `${HYECHO_BASE}/goods/getGoodsEventList.json?goodSeq=${goodSeq}&startDay=${month.eventStartMonth}01`
        );
        const evData = await evRes.json();
        if (evData.message !== "SUCCESS") continue;
        for (const v of evData.list ?? []) {
          if (v.procCd === "99") continue; // 취소 제외
          departures.push({
            eventSeq: v.eventSeq,
            startDay: v.startDay,
            personCnt: v.personCnt,
            minPersonCnt: v.minPersonCnt,
            resvCnt: v.resvCnt + v.dpResCnt,
            restCnt: v.restCnt > 0 ? v.restCnt : 0,
            procCd: v.procCd,
            saleAmt: v.saleAmt,
          });
        }
      } catch (e: any) {
        console.warn(`  출발일 조회 실패 (${month.eventStartMonth}): ${e.message}`);
      }
    }
  } catch (e: any) {
    console.warn(`  월목록 조회 실패 (goodSeq=${goodSeq}): ${e.message}`);
  }
  return departures;
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

  // Resume: load existing results to skip already-crawled products
  const results: any[] = existsSync(OUTPUT_PATH)
    ? JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"))
    : [];
  const resultsMap = new Map(results.map((r: any) => [r.id, r]));
  const crawledIds = new Set(resultsMap.keys());
  console.log(`Resuming: ${crawledIds.size} products already crawled, ${PRODUCT_LIST.length - crawledIds.size} remaining`);
  let totalLocations = results.reduce((sum: number, r: any) => sum + (r.locations?.length ?? 0), 0);

  for (let i = 0; i < PRODUCT_LIST.length; i++) {
    const p = PRODUCT_LIST[i];
    const url = p.e
      ? `https://www.hyecho.com/goods/goods_view?goodSeq=${p.s}&eventSeq=${p.e}`
      : `https://www.hyecho.com/goods/goods_view?goodSeq=${p.s}`;

    const productId = `hyecho-${p.s}`;

    // 이미 기본 정보 크롤링된 상품 → departures만 갱신
    if (crawledIds.has(productId)) {
      const existing = resultsMap.get(productId);
      const lastUpdated = existing?.departuresUpdatedAt;
      const hoursAgo = lastUpdated
        ? (Date.now() - new Date(lastUpdated).getTime()) / 3_600_000
        : Infinity;
      if (hoursAgo < 6) {
        console.log(`[${i + 1}/${PRODUCT_LIST.length}] ${p.s} — skipped (departures updated ${Math.round(hoursAgo)}h ago)`);
        continue;
      }
      console.log(`\n[${i + 1}/${PRODUCT_LIST.length}] ${p.s} — departures 갱신 중...`);
      const departures = await fetchDepartures(p.s);
      existing.departures = departures;
      existing.departuresUpdatedAt = new Date().toISOString();
      console.log(`  ✓ ${departures.length}개 출발일`);
      // locations가 비어있으면 skip하지 않고 아래서 재추출
      if (existing.locations && existing.locations.length > 0) continue;
      console.log(`  locations 없음 — 페이지 재크롤로 위치 추출`);
    }

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

      console.log(`  출발일 수집 중...`);
      const departures = await fetchDepartures(p.s);
      console.log(`  ✓ ${departures.length}개 출발일`);

      const product = {
        id: `hyecho-${p.s}`,
        category: p.c,
        title: data.title,
        price: data.price,
        duration: data.duration,
        url,
        imageUrl: data.imageUrl,
        locations,
        departures,
        departuresUpdatedAt: new Date().toISOString(),
      };
      results.push(product);
      resultsMap.set(product.id, product);
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
