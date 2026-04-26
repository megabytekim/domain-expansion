/**
 * Enrich hyecho-packages.json with locations for products that have 0 locations.
 * Uses title-based keyword → coordinate mapping.
 * Run: cd unesco && npx tsx scripts/enrich-locations.ts
 */
import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

const PACKAGES_PATH = resolve(__dirname, "../data/hyecho-packages.json");
const GEOCODE_CACHE_PATH = resolve(__dirname, "../data/geocode-cache.json");

// Manual mapping: Korean destination keywords → English names for geocoding
const KEYWORD_TO_COORDS: Record<string, { name: string; lat: number; lng: number }[]> = {
  "황산": [{ name: "황산 (Huangshan)", lat: 30.13, lng: 118.17 }],
  "삼청산": [{ name: "삼청산 (Sanqingshan)", lat: 28.91, lng: 118.06 }],
  "페로제도": [{ name: "페로제도 (Faroe Islands)", lat: 62.01, lng: -6.77 }],
  "아이슬란드": [{ name: "아이슬란드 (Iceland)", lat: 64.96, lng: -19.02 }],
  "카일라스": [{ name: "카일라스 (Mt. Kailash)", lat: 31.07, lng: 81.31 }],
  "티벳": [{ name: "라싸 (Lhasa)", lat: 29.65, lng: 91.17 }],
  "일본 동북": [{ name: "센다이 (Sendai)", lat: 38.27, lng: 140.87 }],
  "돌로미테": [{ name: "돌로미테 (Dolomites)", lat: 46.41, lng: 11.84 }],
  "후지산": [{ name: "후지산 (Mt. Fuji)", lat: 35.36, lng: 138.73 }],
  "키르기즈": [{ name: "비쉬케크 (Bishkek)", lat: 42.87, lng: 74.59 }],
  "화산": [{ name: "화산 (Huashan)", lat: 34.47, lng: 110.09 }],
  "숭산": [{ name: "숭산 (Songshan)", lat: 34.49, lng: 113.07 }],
  "캐나다 로키": [{ name: "밴프 (Banff)", lat: 51.18, lng: -115.57 }],
  "호도협": [{ name: "호도협 (Tiger Leaping Gorge)", lat: 27.17, lng: 100.15 }],
  "옥룡설산": [{ name: "옥룡설산 (Jade Dragon Snow Mt.)", lat: 27.12, lng: 100.23 }],
  "안나푸르나": [{ name: "안나푸르나 (Annapurna)", lat: 28.60, lng: 83.82 }],
  "키나발루": [{ name: "키나발루 (Mt. Kinabalu)", lat: 6.08, lng: 116.56 }],
  "랑탕": [{ name: "랑탕 (Langtang)", lat: 28.21, lng: 85.52 }],
  "무스탕": [{ name: "무스탕 (Mustang)", lat: 29.18, lng: 83.77 }],
  "나카센도": [{ name: "나카센도 (Nakasendo)", lat: 35.57, lng: 137.60 }],
  "마나도": [{ name: "마나도 (Manado)", lat: 1.49, lng: 124.84 }],
  "술라웨시": [{ name: "술라웨시 (Sulawesi)", lat: 1.49, lng: 124.84 }],
  "라다크": [{ name: "레 (Leh, Ladakh)", lat: 34.16, lng: 77.58 }],
  "칠채산": [{ name: "칠채산 (Zhangye Danxia)", lat: 38.92, lng: 100.44 }],
  "황하석림": [{ name: "황하석림 (Yellow River Stone Forest)", lat: 36.34, lng: 104.27 }],
  "킬리만자로": [{ name: "킬리만자로 (Kilimanjaro)", lat: -3.08, lng: 37.35 }],
  "응고롱고로": [{ name: "응고롱고로 (Ngorongoro)", lat: -3.22, lng: 35.45 }],
  "토스카나": [{ name: "피렌체 (Florence)", lat: 43.77, lng: 11.25 }],
  "피에몬테": [{ name: "토리노 (Turin)", lat: 45.07, lng: 7.69 }],
  "가미코지": [{ name: "가미코치 (Kamikochi)", lat: 36.25, lng: 137.63 }],
  "코카서스": [{ name: "트빌리시 (Tbilisi)", lat: 41.72, lng: 44.79 }, { name: "예레반 (Yerevan)", lat: 40.18, lng: 44.51 }, { name: "바쿠 (Baku)", lat: 40.41, lng: 49.87 }],
  "장강": [{ name: "충칭 (Chongqing)", lat: 29.56, lng: 106.55 }, { name: "상하이 (Shanghai)", lat: 31.23, lng: 121.47 }],
  "중경": [{ name: "충칭 (Chongqing)", lat: 29.56, lng: 106.55 }],
  "상해": [{ name: "상하이 (Shanghai)", lat: 31.23, lng: 121.47 }],
  "부탄": [{ name: "팀푸 (Thimphu)", lat: 27.47, lng: 89.64 }, { name: "파로 (Paro)", lat: 27.43, lng: 89.42 }],
  "폴란드": [{ name: "크라쿠프 (Krakow)", lat: 50.06, lng: 19.94 }, { name: "바르샤바 (Warsaw)", lat: 52.23, lng: 21.01 }],
  "발트3국": [{ name: "빌뉴스 (Vilnius)", lat: 54.69, lng: 25.28 }, { name: "리가 (Riga)", lat: 56.95, lng: 24.11 }, { name: "탈린 (Tallinn)", lat: 59.44, lng: 24.75 }],
  "청장열차": [{ name: "라싸 (Lhasa)", lat: 29.65, lng: 91.17 }, { name: "시닝 (Xining)", lat: 36.62, lng: 101.77 }],
  "중앙아시아": [{ name: "사마르칸트 (Samarkand)", lat: 39.65, lng: 66.96 }, { name: "부하라 (Bukhara)", lat: 39.77, lng: 64.42 }, { name: "타슈켄트 (Tashkent)", lat: 41.30, lng: 69.28 }],
  "천산남로": [{ name: "투르판 (Turpan)", lat: 42.95, lng: 89.19 }, { name: "카슈가르 (Kashgar)", lat: 39.47, lng: 75.99 }],
  "독일 동부": [{ name: "드레스덴 (Dresden)", lat: 51.05, lng: 13.74 }, { name: "바이마르 (Weimar)", lat: 50.98, lng: 11.33 }],
  "몽골": [{ name: "울란바토르 (Ulaanbaatar)", lat: 47.92, lng: 106.91 }],
  "고비사막": [{ name: "고비사막 (Gobi)", lat: 43.50, lng: 105.00 }],
  "강남수향": [{ name: "소주 (Suzhou)", lat: 31.30, lng: 120.58 }, { name: "주좡 (Zhouzhuang)", lat: 31.11, lng: 120.85 }],
  "그랜드서클": [{ name: "그랜드캐니언 (Grand Canyon)", lat: 36.11, lng: -112.11 }],
  "요세미티": [{ name: "요세미티 (Yosemite)", lat: 37.87, lng: -119.54 }],
  "데스밸리": [{ name: "데스밸리 (Death Valley)", lat: 36.51, lng: -117.08 }],
  "네덜란드": [{ name: "암스테르담 (Amsterdam)", lat: 52.37, lng: 4.90 }],
  "벨기에": [{ name: "브뤼헤 (Bruges)", lat: 51.21, lng: 3.22 }],
  "브루나이": [{ name: "반다르스리브가완 (Bandar)", lat: 4.93, lng: 114.95 }],
  "말레이시아": [{ name: "코타키나발루 (Kota Kinabalu)", lat: 5.98, lng: 116.07 }],
  "이탈리아 중남부": [{ name: "나폴리 (Naples)", lat: 40.85, lng: 14.27 }, { name: "아말피 (Amalfi)", lat: 40.63, lng: 14.60 }],
  "이스키아": [{ name: "이스키아 (Ischia)", lat: 40.73, lng: 13.90 }],
  "그린란드": [{ name: "누크 (Nuuk)", lat: 64.18, lng: -51.72 }],
  "남극": [{ name: "우수아이아 (Ushuaia)", lat: -54.80, lng: -68.30 }, { name: "남극반도 (Antarctic Peninsula)", lat: -65.00, lng: -60.00 }],
  "구채구": [{ name: "구채구 (Jiuzhaigou)", lat: 33.26, lng: 103.92 }],
  "황룡": [{ name: "황룡 (Huanglong)", lat: 32.75, lng: 103.82 }],
  "야딩": [{ name: "야딩 (Yading)", lat: 28.38, lng: 100.30 }],
  "샹그릴라": [{ name: "샹그릴라 (Shangri-La)", lat: 27.83, lng: 99.71 }],
  "산티아고": [{ name: "산티아고 데 콤포스텔라 (Santiago)", lat: 42.88, lng: -8.54 }],
  "비아프란치제나": [{ name: "로마 (Rome)", lat: 41.90, lng: 12.50 }, { name: "시에나 (Siena)", lat: 43.32, lng: 11.33 }],
  "하와이": [{ name: "호놀룰루 (Honolulu)", lat: 21.31, lng: -157.86 }],
  "포르투갈": [{ name: "포르투 (Porto)", lat: 41.16, lng: -8.63 }, { name: "리스본 (Lisbon)", lat: 38.72, lng: -9.14 }],
  "스위스": [{ name: "취리히 (Zurich)", lat: 47.37, lng: 8.54 }, { name: "인터라켄 (Interlaken)", lat: 46.69, lng: 7.86 }],
  "몽트뢰": [{ name: "몽트뢰 (Montreux)", lat: 46.43, lng: 6.91 }],
  "생모리츠": [{ name: "생모리츠 (St. Moritz)", lat: 46.50, lng: 9.84 }],
  "안데르마트": [{ name: "안데르마트 (Andermatt)", lat: 46.64, lng: 8.59 }],
  "베트머알프": [{ name: "베트머알프 (Bettmeralp)", lat: 46.39, lng: 8.07 }],
  "사천성": [{ name: "청두 (Chengdu)", lat: 30.57, lng: 104.07 }],
  "청해성": [{ name: "시닝 (Xining)", lat: 36.62, lng: 101.77 }],
  "바단지린": [{ name: "바단지린사막 (Badain Jaran)", lat: 39.97, lng: 102.45 }],
  "감숙성": [{ name: "란저우 (Lanzhou)", lat: 36.06, lng: 103.83 }],
  "하서회랑": [{ name: "둔황 (Dunhuang)", lat: 40.14, lng: 94.66 }],
  "이탈리아 중북부": [{ name: "피렌체 (Florence)", lat: 43.77, lng: 11.25 }, { name: "볼차노 (Bolzano)", lat: 46.50, lng: 11.35 }],
  "북알프스": [{ name: "마쓰모토 (Matsumoto)", lat: 36.24, lng: 137.97 }],
};

interface Package {
  id: string;
  category: string;
  title: string;
  price: string;
  duration: string;
  url: string;
  imageUrl: string;
  locations: { name: string; lat: number; lng: number }[];
}

const packages: Package[] = JSON.parse(readFileSync(PACKAGES_PATH, "utf-8"));

let enriched = 0;
for (const pkg of packages) {
  if (pkg.locations.length > 0) continue; // Already has locations

  const matched: { name: string; lat: number; lng: number }[] = [];
  for (const [keyword, coords] of Object.entries(KEYWORD_TO_COORDS)) {
    if (pkg.title.includes(keyword)) {
      coords.forEach(c => {
        // Avoid duplicates
        if (!matched.some(m => m.lat === c.lat && m.lng === c.lng)) {
          matched.push(c);
        }
      });
    }
  }

  if (matched.length > 0) {
    pkg.locations = matched;
    enriched++;
    console.log(`✅ ${pkg.title} → ${matched.map(m => m.name).join(", ")}`);
  } else {
    console.log(`❌ ${pkg.title} → no match`);
  }
}

writeFileSync(PACKAGES_PATH, JSON.stringify(packages, null, 2));
console.log(`\nEnriched ${enriched} products. Total with locations: ${packages.filter(p => p.locations.length > 0).length}/${packages.length}`);
