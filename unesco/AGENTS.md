<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Geocode Verification

After any crawl run or manual geocode fix, run this check to catch bad coordinates.

**Rule:** Within a single product, all locations should be geographically close. If one location is >3000km from the centroid of the others, it's almost certainly a wrong geocode.

## How to run

```bash
node -e "
const products = require('./data/hyecho-packages.json');
function haversine(lat1,lng1,lat2,lng2){const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180,a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
const THRESHOLD=3000,flags=[];
for(const p of products){const locs=p.locations;if(locs.length<2)continue;const cLat=locs.reduce((s,l)=>s+l.lat,0)/locs.length,cLng=locs.reduce((s,l)=>s+l.lng,0)/locs.length;for(const loc of locs){const d=haversine(loc.lat,loc.lng,cLat,cLng);if(d>THRESHOLD){const minD=Math.min.apply(null,locs.filter(l=>l!==loc).map(l=>haversine(loc.lat,loc.lng,l.lat,l.lng)));flags.push({title:p.title,name:loc.name,lat:loc.lat,lng:loc.lng,minDist:Math.round(minD)});}}}
flags.sort((a,b)=>b.minDist-a.minDist);
console.log(flags.length+' red flags:');
flags.forEach(f=>console.log('['+f.minDist+'km] '+f.name+' ('+f.lat.toFixed(2)+','+f.lng.toFixed(2)+') <- '+f.title));
"
```

## Common failure patterns

| 증상 | 원인 |
|------|------|
| 좌표가 35°N 105°E 근처 | geocoder 실패 시 반환하는 중국 중심 기본값 |
| 한국어 지명이 다른 나라로 | 동명이지 (이란→Iran, 산호세→San Jose CA, 안티구아→Augsburg 등) |
| 공항 코드(CHC, NRT 등) | 도시명 아닌 코드로 geocode 시 엉뚱한 결과 |
| 인도네시아 상품에 델리, 두바이 등 | 크롤러가 경유지 언급을 목적지로 오추출 — 상품 제목 국가와 맞지 않는 위치는 제거 |
| **(TK) 상품에 이스탄불, (EK) 상품에 두바이** | 항공사 코드 포함 상품에서 경유 도시를 목적지로 오추출 — 제목의 항공사 코드로 판별해 제거 |
| **라밧(Rabat)이 42°N 근처** | 모로코 라밧(34°N, -6.8°E)을 피레네 인근으로 잘못 geocoding — cache에 올바른 좌표 고정 필요 |
| **메디나(사우디)가 북아프리카 투어에 포함** | 모로코 구시가지 "메디나"를 사우디 도시 Medina로 오해 — cache에서 삭제해 재geocoding 유도 |

## Fix workflow

1. 스캔 결과에서 명확한 오류 확인
2. 올바른 좌표 조사 (Google Maps 등)
3. `data/geocode-cache.json` 수정 (재크롤 때 재사용)
4. `data/hyecho-packages.json` 수정 (현재 표시 반영)
5. `vercel --prod` 배포

> **주의**: 크롤 워크플로우(`.github/workflows/crawl.yml`)는 매주 `hyecho-packages.json`을 덮어쓴다.
> 수동으로 좌표를 고쳤다면 반드시 `geocode-cache.json`도 함께 수정해야 다음 크롤에서 재발하지 않는다.
> 항공사 경유지 오추출은 크롤러 로직 문제이므로 cache 수정만으로는 근본 해결이 안 됨 — 크롤 후마다 verification 스캔을 돌릴 것.

---

# Vercel 배포

## 구조

이 프로젝트는 `domain-expansion` 모노레포의 `unesco/` 서브디렉토리다.
GitHub push는 루트 프로젝트(`domain-expansion`)를 트리거하지만,
실제 서비스인 `unesco-delta.vercel.app`은 **별도 Vercel 프로젝트**(`unesco`)로 연결되어 있어 **자동 배포가 되지 않는다**.

## 배포 방법

코드나 데이터 변경 후 반드시 수동 배포 필요:

```bash
# unesco/ 디렉토리에서 실행
vercel --prod
```

## 크롤 후 배포 순서

1. GitHub Actions 워크플로우 완료 확인 (수동: `workflow_dispatch` 또는 매주 월요일 자동)
2. `git pull` 로 최신 데이터 받기
3. geocode verification 스캔 실행 (위 스크립트)
4. 오류 있으면 `geocode-cache.json` + `hyecho-packages.json` 수정 후 commit & push
5. `vercel --prod` 로 배포
6. 사이트에서 인기순위 날짜(우상단)가 오늘 날짜인지 확인
