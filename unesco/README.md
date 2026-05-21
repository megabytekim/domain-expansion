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

## 현황 (2026-05-06 기준)

| 항목 | 내용 |
|------|------|
| 총 상품 수 | 154개 |
| 데이터 최신화 | 매주 자동 (월요일 09:00 KST) |
| 최근 데이터 | 2026-05-04 크롤 → 05-06 수동 배포 |
| 인기 순위 기준 | 90일 예약량 × √예약자수 |
| 알려진 이슈 | (TK)(EK) 항공사 경유지 좌표 오추출 → 크롤 후 수동 확인 필요 |

---

## TODO

- [ ] **CI/CD: Deploy 스텝 미실행 원인 조사** — 5/4 크롤에서 commit&push 성공했으나 `vercel --prod` 스텝이 실행되지 않음. 5/6 수동 `workflow_dispatch`로 재현 테스트 중
- [ ] **GitHub 계정 권한 정리** — `megabytekim` 계정으로 워크플로우 트리거 필요. `socar-newyork`은 READ 권한만 있어 dispatch 불가
- [ ] **Geocode 경계 케이스 모니터링** — 상파울루(-23.55, -46.63)이 콜롬비아+아마존 상품에 포함 (2686km, 임계값 미만이나 주시 필요)
- [ ] **Dev 환경 구성 검토** — 현재 개선 작업은 로컬 `npm run dev` + Playwright 자체 검토 후 `vercel --prod`. 향후 옵션:
    - (A) `vercel` (preview) → 일회성 URL
    - (B) preview + `vercel alias unesco-dev.vercel.app` → 고정 staging URL
    - (C) 별도 dev Vercel 프로젝트 → production 직배포 가드레일

## 개선 후보 (2026-05-20 Playwright 검토)

- [x] **필터 슬라이더 초기 상태에 데이터 범위 노출** ✅ 2026-05-21
- [x] **Pilgrim Manuscript 디자인 적용** ✅ 2026-05-21 — Noto Serif KR + Cormorant Garamond, 묵빛/한지/단청 적색 3축, 마커는 패키지별 50색 팔레트 유지
- [x] **혜초대사 a2a 챗봇 통합** ✅ 2026-05-21 — `hyecho-master/` 별도 Vercel 프로젝트, ChatWidget(데스크탑 좌하단 + 모바일 트로피 아래), CORS regex로 모든 unesco preview URL 허용
- [x] **데이터 기준 caption (데스크탑 상단 중앙)** ✅ 2026-05-21
- [~] **출발 일정 "예약 > 정원" 표기** — 0.6% 케이스, 보류
- [~] **검색 결과 8개 하드캡** — 매칭 카운트 이미 노출, 보류
- [~] **모바일 상단 영역 점유율** — 보류
- [~] **마커 색상 의미 부여** — 논의만 저장:
    - v1 안: 카테고리 4색 → 분포 한눈에 보이나 카테고리당 ~40개 패키지 동시 구분 불가
    - v2 안: 마커 hover 시 `locations[0] → [N-1]` polyline (데이터에 일정 순서 보존됨, 안나푸르나·나카센도 등). arc + 방향 화살표
    - 보류 사유: 코드 복잡도 (line layer + hover 동적 GeoJSON 갱신)
- [~] **마커 hit-radius** — 보류
- [~] **UNESCO 데이터 활용 확인** — 1245개 사이트 GeoJSON 미노출, 보류

## 다음 라운드 후보

- **혜초대사 채팅 영속화 (KV)** — 현재 in-memory라 Vercel serverless 콜드 스타트마다 사라짐. Upstash Redis 또는 Vercel KV 도입
- **혜초대사 채팅 스트리밍 (SSE)** — 긴 답변 점진 출력으로 체감 응답 속도 ↑
- **상품 상세에서 같은 패키지 마커 polyline 시각화** — 한 투어가 도는 도시들 지도에 곡선으로 (위 마커 색상 v2 안과 동일)
- **공유용 deep link** — 선택한 상품/위치를 URL에 반영 (URL state) → 링크 공유 가능
- **즐겨찾기 (localStorage)** — 별표 표시한 상품만 모아보기
- **인기순 외 정렬 옵션** — 가격순/기간순/카테고리별
- **모바일에도 데이터 기준 표시 위치 찾기** — 현재 데스크탑만 노출
