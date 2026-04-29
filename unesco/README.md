# 혜초여행 세계 투어 지도

**https://unesco-delta.vercel.app**

혜초여행사 해외 패키지 상품을 지도에서 탐색하는 웹앱.  
트레킹 · 문화 · 실크로드 카테고리별 필터, 인기 순위, 출발 일정 표시.

---

## 스택

- **Next.js 16** (App Router, Static Export)
- **MapLibre GL JS** — 지도 렌더링
- **MapTiler** — 지도 타일
- Tailwind CSS

---

## 데이터 구조

```
data/
  hyecho-packages.json     # 혜초여행사 상품 목록 (크롤링)
  geocode-cache.json       # 지명 → 좌표 캐시
  unesco-sites.json        # UNESCO 세계유산 목록
  hyecho-unesco-mapping.json
```

- 데이터는 **빌드 타임에 번들링**됨 (`import rawProducts from "@/data/hyecho-packages.json"`)
- 런타임 API 없음, 완전 정적

---

## 로컬 개발

```bash
npm install
npm run dev        # http://localhost:3000
```

---

## 데이터 업데이트

### 자동 (매주 월요일 09:00 KST)

GitHub Actions `.github/workflows/crawl.yml` 이 자동 실행:
1. Playwright로 혜초여행사 크롤링
2. UNESCO 데이터 fetch
3. 위치 좌표 보강
4. 변경사항 commit & push
5. **Vercel 자동 배포** (`vercel --prod`)

### 수동 실행

```bash
# 1. 워크플로우 수동 트리거 (GitHub Actions → Weekly Data Crawl → Run workflow)
# 또는 로컬에서 직접:
npx tsx scripts/crawl-all-hyecho.ts
npx tsx scripts/fetch-unesco.ts
npx tsx scripts/enrich-locations.ts

# 2. Geocode 검증
node -e "
const products = require('./data/hyecho-packages.json');
function haversine(lat1,lng1,lat2,lng2){const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180,a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
const flags=[];
for(const p of products){const locs=p.locations;if(!locs||locs.length<2)continue;const c=[locs.reduce((s,l)=>s+l.lat,0)/locs.length,locs.reduce((s,l)=>s+l.lng,0)/locs.length];for(const loc of locs){const d=haversine(loc.lat,loc.lng,c[0],c[1]);if(d>3000)flags.push({dist:Math.round(d),name:loc.name,title:p.title});}}
flags.sort((a,b)=>b.dist-a.dist).forEach(f=>console.log('['+f.dist+'km]',f.name,'<-',f.title));
"

# 3. 배포
vercel --prod
```

### 주의사항

> **이 프로젝트는 `domain-expansion` 모노레포의 서브디렉토리.**  
> GitHub push는 루트 프로젝트를 트리거하므로 `unesco-delta.vercel.app`은 **자동 배포 안 됨**.  
> 반드시 `vercel --prod` (또는 위 워크플로우)로 배포할 것.

> 크롤 후 `geocode-cache.json`도 함께 수정하지 않으면 다음 크롤에서 오류 재발.  
> 알려진 패턴 → `AGENTS.md` 참고.

---

## 현황 (2026-04-29 기준)

| 항목 | 내용 |
|------|------|
| 총 상품 수 | 154개 |
| 데이터 최신화 | 매주 자동 |
| 인기 순위 기준 | 90일 예약량 × √예약자수 |
| 알려진 이슈 | (TK)(EK) 항공사 경유지 좌표 오추출 → 크롤 후 수동 확인 필요 |
