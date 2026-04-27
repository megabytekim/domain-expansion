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
  // New keywords for 105 additional products
  "알프스": [{ name: "샤모니 (Chamonix)", lat: 45.92, lng: 6.87 }],
  "서유럽": [{ name: "파리 (Paris)", lat: 48.86, lng: 2.35 }],
  "동유럽": [{ name: "프라하 (Prague)", lat: 50.08, lng: 14.44 }],
  "에베레스트": [{ name: "에베레스트BC (Everest BC)", lat: 28.00, lng: 86.85 }],
  "인도": [{ name: "델리 (Delhi)", lat: 28.61, lng: 77.21 }],
  "파키스탄": [{ name: "이슬라마바드 (Islamabad)", lat: 33.69, lng: 73.04 }],
  "스리랑카": [{ name: "콜롬보 (Colombo)", lat: 6.93, lng: 79.85 }, { name: "시기리야 (Sigiriya)", lat: 7.96, lng: 80.76 }],
  "네팔": [{ name: "카트만두 (Kathmandu)", lat: 27.71, lng: 85.32 }],
  "장가계": [{ name: "장가계 (Zhangjiajie)", lat: 29.12, lng: 110.48 }],
  "태항산": [{ name: "태항산 (Taihang Mountains)", lat: 36.20, lng: 113.70 }],
  "백두산": [{ name: "백두산 (Changbai Mountain)", lat: 42.00, lng: 128.08 }],
  "내몽골": [{ name: "후허하오터 (Hohhot)", lat: 40.84, lng: 111.75 }],
  "계림": [{ name: "계림 (Guilin)", lat: 25.27, lng: 110.29 }],
  "단하산": [{ name: "단하산 (Danxiashan)", lat: 25.03, lng: 113.73 }],
  "무이산": [{ name: "무이산 (Wuyishan)", lat: 27.75, lng: 118.03 }],
  "일본알프스": [{ name: "다카야마 (Takayama)", lat: 36.14, lng: 137.25 }],
  "북해도": [{ name: "삿포로 (Sapporo)", lat: 43.06, lng: 141.35 }],
  "큐슈": [{ name: "후쿠오카 (Fukuoka)", lat: 33.59, lng: 130.40 }],
  "시코쿠": [{ name: "마쓰야마 (Matsuyama)", lat: 33.84, lng: 132.77 }],
  "오키나와": [{ name: "나하 (Naha)", lat: 26.33, lng: 127.80 }],
  "동남아": [{ name: "방콕 (Bangkok)", lat: 13.76, lng: 100.50 }],
  "홍콩": [{ name: "홍콩 (Hong Kong)", lat: 22.32, lng: 114.17 }],
  "대만": [{ name: "타이베이 (Taipei)", lat: 25.03, lng: 121.57 }],
  "카자흐": [{ name: "알마티 (Almaty)", lat: 43.24, lng: 76.95 }],
  "러시아": [{ name: "모스크바 (Moscow)", lat: 55.76, lng: 37.62 }],
  "미국": [{ name: "로스앤젤레스 (LA)", lat: 34.05, lng: -118.24 }],
  "캐나다": [{ name: "밴쿠버 (Vancouver)", lat: 49.28, lng: -123.12 }],
  "남미": [{ name: "쿠스코 (Cusco)", lat: -13.53, lng: -71.97 }],
  "중미": [{ name: "멕시코시티 (Mexico City)", lat: 19.43, lng: -99.13 }],
  "뉴질랜드": [{ name: "퀸스타운 (Queenstown)", lat: -45.03, lng: 168.66 }],
  "호주": [{ name: "시드니 (Sydney)", lat: -33.87, lng: 151.21 }],
  "모로코": [{ name: "마라케시 (Marrakech)", lat: 31.63, lng: -8.00 }],
  "요르단": [{ name: "페트라 (Petra)", lat: 30.33, lng: 35.44 }],
  "이집트": [{ name: "카이로 (Cairo)", lat: 30.04, lng: 31.24 }],
  "실크로드": [{ name: "사마르칸트 (Samarkand)", lat: 39.65, lng: 66.96 }],
  "운남": [{ name: "쿤밍 (Kunming)", lat: 25.04, lng: 102.68 }, { name: "리장 (Lijiang)", lat: 26.87, lng: 100.23 }],
  "귀주": [{ name: "구이양 (Guiyang)", lat: 26.65, lng: 106.63 }],
  "복건": [{ name: "샤먼 (Xiamen)", lat: 24.48, lng: 118.09 }],
  "강서": [{ name: "난창 (Nanchang)", lat: 28.68, lng: 115.86 }],
  "북경": [{ name: "베이징 (Beijing)", lat: 39.90, lng: 116.41 }],
  "항주": [{ name: "항저우 (Hangzhou)", lat: 30.25, lng: 120.17 }],
  "하얼빈": [{ name: "하얼빈 (Harbin)", lat: 45.75, lng: 126.65 }],
  "북유럽": [{ name: "코펜하겐 (Copenhagen)", lat: 55.69, lng: 12.57 }],
  "남유럽": [{ name: "바르셀로나 (Barcelona)", lat: 41.39, lng: 2.17 }],
  "지중해": [{ name: "아테네 (Athens)", lat: 37.98, lng: 23.73 }],
  "모리셔스": [{ name: "모리셔스 (Mauritius)", lat: -20.35, lng: 57.55 }],
  "마나사로바": [{ name: "마나사로바 호수 (Lake Manasarovar)", lat: 30.65, lng: 81.46 }],
  "패러글라이딩": [{ name: "인터라켄 (Interlaken)", lat: 46.69, lng: 7.86 }],
  "마추픽추": [{ name: "마추픽추 (Machu Picchu)", lat: -13.16, lng: -72.55 }],
  "우유니": [{ name: "우유니 (Uyuni)", lat: -20.46, lng: -66.83 }],
  "파타고니아": [{ name: "파타고니아 (Patagonia)", lat: -50.34, lng: -72.26 }],
  "제주": [{ name: "제주시 (Jeju)", lat: 33.50, lng: 126.53 }],
  "밀포드": [{ name: "밀포드사운드 (Milford Sound)", lat: -44.67, lng: 167.93 }],
  "쿡산": [{ name: "마운트쿡 (Mt. Cook)", lat: -43.73, lng: 170.10 }],
  "통가리로": [{ name: "통가리로 (Tongariro)", lat: -39.28, lng: 175.57 }],
  "독일": [{ name: "뮌헨 (Munich)", lat: 48.14, lng: 11.58 }, { name: "베를린 (Berlin)", lat: 52.52, lng: 13.40 }],
  "프랑스": [{ name: "파리 (Paris)", lat: 48.86, lng: 2.35 }, { name: "리옹 (Lyon)", lat: 45.75, lng: 4.83 }],
  "스코틀랜드": [{ name: "에든버러 (Edinburgh)", lat: 55.95, lng: -3.19 }, { name: "하이랜드 (Highlands)", lat: 57.12, lng: -4.71 }],
  "영국": [{ name: "런던 (London)", lat: 51.51, lng: -0.13 }],
  "아일랜드": [{ name: "더블린 (Dublin)", lat: 53.33, lng: -6.25 }],
  "베트남": [{ name: "하노이 (Hanoi)", lat: 21.03, lng: 105.85 }, { name: "호찌민 (Ho Chi Minh)", lat: 10.82, lng: 106.63 }],
  "인도네시아": [{ name: "발리 (Bali)", lat: -8.34, lng: 115.09 }, { name: "자카르타 (Jakarta)", lat: -6.21, lng: 106.85 }],
  "싱가포르": [{ name: "싱가포르 (Singapore)", lat: 1.35, lng: 103.82 }],
  "오스트리아": [{ name: "비엔나 (Vienna)", lat: 48.21, lng: 16.37 }, { name: "잘츠부르크 (Salzburg)", lat: 47.80, lng: 13.04 }],
  "스페인": [{ name: "마드리드 (Madrid)", lat: 40.42, lng: -3.70 }, { name: "바르셀로나 (Barcelona)", lat: 41.39, lng: 2.17 }],
  "그리스": [{ name: "아테네 (Athens)", lat: 37.98, lng: 23.73 }, { name: "산토리니 (Santorini)", lat: 36.40, lng: 25.46 }],
  "크로아티아": [{ name: "두브로브니크 (Dubrovnik)", lat: 42.65, lng: 18.09 }, { name: "플리트비체 (Plitvice)", lat: 44.87, lng: 15.62 }],
  "터키": [{ name: "이스탄불 (Istanbul)", lat: 41.01, lng: 28.98 }, { name: "카파도키아 (Cappadocia)", lat: 38.65, lng: 34.83 }],
  "이란": [{ name: "테헤란 (Tehran)", lat: 35.69, lng: 51.39 }, { name: "이스파한 (Isfahan)", lat: 32.66, lng: 51.68 }],
  "쿠바": [{ name: "하바나 (Havana)", lat: 23.14, lng: -82.36 }],
  "멕시코": [{ name: "멕시코시티 (Mexico City)", lat: 19.43, lng: -99.13 }, { name: "칸쿤 (Cancun)", lat: 21.17, lng: -86.85 }],
  "페루": [{ name: "리마 (Lima)", lat: -12.05, lng: -77.04 }, { name: "쿠스코 (Cusco)", lat: -13.53, lng: -71.97 }],
  "아르헨티나": [{ name: "부에노스아이레스 (Buenos Aires)", lat: -34.61, lng: -58.38 }],
  "케냐": [{ name: "나이로비 (Nairobi)", lat: -1.29, lng: 36.82 }],
  "탄자니아": [{ name: "탄자니아 (Tanzania)", lat: -6.37, lng: 34.89 }],
  "에티오피아": [{ name: "아디스아바바 (Addis Ababa)", lat: 9.00, lng: 38.75 }],
  "나미비아": [{ name: "빈트후크 (Windhoek)", lat: -22.56, lng: 17.08 }],
  "스위스 알프스": [{ name: "취리히 (Zurich)", lat: 47.37, lng: 8.54 }, { name: "인터라켄 (Interlaken)", lat: 46.69, lng: 7.86 }],
  "이탈리아": [{ name: "로마 (Rome)", lat: 41.90, lng: 12.50 }, { name: "밀라노 (Milan)", lat: 45.46, lng: 9.19 }],
  "앙코르와트": [{ name: "씨엠립 (Siem Reap)", lat: 13.36, lng: 103.86 }],
  "캄보디아": [{ name: "씨엠립 (Siem Reap)", lat: 13.36, lng: 103.86 }],
  "미얀마": [{ name: "양곤 (Yangon)", lat: 16.87, lng: 96.19 }, { name: "바간 (Bagan)", lat: 21.17, lng: 94.86 }],
  "태국": [{ name: "방콕 (Bangkok)", lat: 13.76, lng: 100.50 }, { name: "치앙마이 (Chiang Mai)", lat: 18.79, lng: 98.98 }],
  "필리핀": [{ name: "마닐라 (Manila)", lat: 14.60, lng: 120.98 }],
  "라오스": [{ name: "루앙프라방 (Luang Prabang)", lat: 19.89, lng: 102.13 }],
  "아이슬랜드": [{ name: "레이캬비크 (Reykjavik)", lat: 64.13, lng: -21.91 }],
  "노르웨이": [{ name: "오슬로 (Oslo)", lat: 59.91, lng: 10.75 }, { name: "피오르드 (Fjords)", lat: 61.20, lng: 7.10 }],
  "스웨덴": [{ name: "스톡홀름 (Stockholm)", lat: 59.33, lng: 18.07 }],
  "핀란드": [{ name: "헬싱키 (Helsinki)", lat: 60.17, lng: 24.94 }],
  "덴마크": [{ name: "코펜하겐 (Copenhagen)", lat: 55.69, lng: 12.57 }],
  "체코": [{ name: "프라하 (Prague)", lat: 50.08, lng: 14.44 }],
  "헝가리": [{ name: "부다페스트 (Budapest)", lat: 47.50, lng: 19.04 }],
  "루마니아": [{ name: "부쿠레슈티 (Bucharest)", lat: 44.43, lng: 26.10 }],
  "론 알프스": [{ name: "리옹 (Lyon)", lat: 45.75, lng: 4.83 }, { name: "안시 (Annecy)", lat: 45.90, lng: 6.12 }],
  "피레네": [{ name: "피레네 (Pyrenees)", lat: 42.65, lng: 0.89 }],
  "돌포": [{ name: "돌포 (Dolpo)", lat: 29.00, lng: 82.80 }],
  "신장": [{ name: "우루무치 (Urumqi)", lat: 43.83, lng: 87.61 }],
  "카라코람": [{ name: "훈자 (Hunza)", lat: 36.32, lng: 74.65 }],
  "낭가파르밧": [{ name: "낭가파르밧 (Nanga Parbat)", lat: 35.24, lng: 74.59 }],
  "훈자": [{ name: "훈자 (Hunza)", lat: 36.32, lng: 74.65 }],
  "K2": [{ name: "K2 베이스캠프 (K2 BC)", lat: 35.88, lng: 76.51 }],
  "남아프리카": [{ name: "케이프타운 (Cape Town)", lat: -33.93, lng: 18.42 }, { name: "요하네스버그 (Johannesburg)", lat: -26.20, lng: 28.04 }],
  "세렝게티": [{ name: "세렝게티 (Serengeti)", lat: -2.33, lng: 34.83 }],
  "알래스카": [{ name: "앵커리지 (Anchorage)", lat: 61.22, lng: -149.90 }],
  "옐로스톤": [{ name: "옐로스톤 (Yellowstone)", lat: 44.60, lng: -110.50 }],
  "튀르키예": [{ name: "이스탄불 (Istanbul)", lat: 41.01, lng: 28.98 }, { name: "카파도키아 (Cappadocia)", lat: 38.65, lng: 34.83 }],
  "아나톨리아": [{ name: "앙카라 (Ankara)", lat: 39.93, lng: 32.86 }],
  "파미르": [{ name: "두샨베 (Dushanbe)", lat: 38.56, lng: 68.77 }],
  "스발바르": [{ name: "롱이어비엔 (Longyearbyen)", lat: 78.22, lng: 15.65 }],
  "북극": [{ name: "롱이어비엔 (Longyearbyen)", lat: 78.22, lng: 15.65 }],
  "가파도": [{ name: "가파도 (Gapa Island)", lat: 33.17, lng: 126.27 }],
  "발칸": [{ name: "스코페 (Skopje)", lat: 41.99, lng: 21.43 }, { name: "사라예보 (Sarajevo)", lat: 43.85, lng: 18.41 }],
  "북마케도니아": [{ name: "스코페 (Skopje)", lat: 41.99, lng: 21.43 }],
  "알바니아": [{ name: "티라나 (Tirana)", lat: 41.33, lng: 19.83 }],
  "몬테네그로": [{ name: "포드고리차 (Podgorica)", lat: 42.44, lng: 19.26 }],
  "시카고": [{ name: "시카고 (Chicago)", lat: 41.88, lng: -87.63 }],
  "마이애미": [{ name: "마이애미 (Miami)", lat: 25.77, lng: -80.19 }],
  "바하마": [{ name: "나소 (Nassau)", lat: 25.05, lng: -77.34 }],
  "타지키스탄": [{ name: "두샨베 (Dushanbe)", lat: 38.56, lng: 68.77 }],
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
