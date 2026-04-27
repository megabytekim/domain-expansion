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

## Fix workflow

1. 스캔 결과에서 명확한 오류 확인
2. 올바른 좌표 조사 (Google Maps 등)
3. `data/geocode-cache.json` 수정 (재크롤 때 재사용)
4. `data/hyecho-packages.json` 수정 (현재 표시 반영)
5. `vercel --prod` 배포
