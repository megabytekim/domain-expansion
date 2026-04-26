# UNESCO World Heritage Sites Map — Design Spec

## Overview

전 세계 UNESCO 세계유산 1,199+개를 인터랙티브 지도로 시각화하고, 혜초여행(hyecho.com) 상품이 있는 사이트를 하이라이트하는 웹 페이지.

## Architecture

### Project Structure

`domain-expansion` 레포 내 독립 Next.js 서브프로젝트로 구성. 기존 정적 HTML 파일(`index.html`, `jeonsi.html`)은 일절 건드리지 않음.

```
domain-expansion/
├── index.html              (기존 - 타이베이 모니터)
├── jeonsi.html             (기존 - 전시번개)
├── unesco/                  (새 Next.js 앱)
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx          (/ → 지도 페이지)
│   ├── components/
│   │   ├── UnescoMap.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── SiteDetail.tsx
│   │   ├── FilterBar.tsx
│   │   └── ClusterMarker.tsx
│   ├── lib/
│   │   ├── merge-data.ts
│   │   └── types.ts
│   ├── data/
│   │   ├── unesco-sites.json
│   │   ├── hyecho-packages.json
│   │   └── hyecho-unesco-mapping.json  (수동 매핑 테이블)
│   ├── scripts/
│   │   └── crawl-hyecho.ts   (Playwright 기반)
│   ├── .env.local            (NEXT_PUBLIC_MAPTILER_KEY)
│   ├── next.config.ts
│   ├── package.json
│   └── tsconfig.json
└── watchlist/              (기존)
```

### Tech Stack

- **Framework**: Next.js (App Router, `output: 'export'` 정적 빌드)
- **Map**: MapLibre GL JS + MapTiler 벡터 타일 (기존 API 키 재활용)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Deploy**: Vercel (별도 프로젝트 또는 서브디렉토리 루트 설정)

### Data Flow

1. `scripts/crawl-hyecho.ts` 1회성 실행 → 혜초 사이트 크롤링 → `hyecho-packages.json`
2. UNESCO 공식 데이터셋 가공 → `unesco-sites.json` (GeoJSON FeatureCollection)
3. 빌드타임에 두 JSON을 `merge-data.ts`로 합침: 각 UNESCO Feature에 `hyechoPackages: [...]` 배열 매핑
4. MapLibre GL이 GeoJSON 소스로 로드 → 클러스터링 → 렌더

### Hyecho-UNESCO Mapping

별도 매핑 파일(`data/hyecho-unesco-mapping.json`)로 관리. 혜초 상품 ID → UNESCO site ID 배열. 크롤러는 상품 데이터만 추출하고, 매핑은 수동 큐레이션.

```json
// data/hyecho-unesco-mapping.json
{
  "hyecho-product-001": [668],
  "hyecho-product-002": [252, 274]
}
```

```json
// data/hyecho-packages.json
[{
  "id": "hyecho-product-001",
  "title": "앙코르와트·톤레삽 5일",
  "price": "1,890,000",
  "duration": "4박 5일",
  "url": "https://www.hyecho.com/product/...",
  "destinations": ["앙코르", "톤레삽"]
}]
```

### Hyecho Crawling

- **도구**: Playwright (혜초 사이트가 CSR 기반일 가능성 대비)
- **대상**: 메인 상품 목록 페이지 → 각 상품의 제목, 가격, 기간, URL 추출
- **실행**: `npx tsx scripts/crawl-hyecho.ts` 로컬 1회성 실행
- **fallback**: 크롤링 실패 시 수동으로 JSON 작성 (상품 수가 많지 않으므로 가능)

### MapTiler API Key

기존 `index.html`에 인라인된 키를 `unesco/.env.local`의 `NEXT_PUBLIC_MAPTILER_KEY`로 이동. `.env.local`은 gitignore 처리.

## UI Design

### Layout: Full-Screen Map + Bottom Sheet

지도가 화면 100%를 차지하고, 마커 클릭 시 하단에서 시트가 올라오는 구조. 모바일 친화적이며 지도 면적을 최대화.

### Visual Style

지도 중심의 깔끔한 UI. Google Maps/Earth 느낌. 기존 domain-expansion 터미널 미학과는 독립적인 디자인.

### Filter Bar

지도 위에 오버레이로 필터 칩 배치:

- **카테고리**: 문화(주황) / 자연(초록) / 복합(파랑) — 토글 방식
- **혜초 상품 있는 곳만 보기**: 별도 토글 칩
- **지역별**: 대륙/지역 드롭다운 또는 칩

### Marker Colors

| 카테고리 | 색상 |
|---------|------|
| 문화유산 | `#ff6b35` (주황) |
| 자연유산 | `#22c55e` (초록) |
| 복합유산 | `#3b82f6` (파랑) |
| 혜초 상품 있음 | 골드 테두리 추가 |

### Clustering

MapLibre GL 네이티브 클러스터링. 줌 레벨에 따라 자동 그룹핑, 클러스터 마커에 카운트 표시.

### Bottom Sheet (3단계)

| 상태 | 높이 | 내용 |
|------|------|------|
| **닫힘** | 0 | 지도만 보임 |
| **반 열림** (half) | ~40% | 사이트명 + 혜초 상품 카드 + 기본 정보 |
| **전체 열림** (full) | ~85% | 설명, 사진, 상세 혜초 상품 카드, 메타데이터 |

### Site Detail (Bottom Sheet Content)

혜초 상품이 가장 상단에 위치 (있는 경우):

1. **혜초여행 상품** (있을 때) — 상품명, 가격, 일정, 링크 버튼
2. **사이트명** (영어 — UNESCO 공식명 사용, 한국어 번역은 v2에서 검토)
3. **사진** (UNESCO 공식 썸네일)
4. **메타**: 국가, 등재연도, 카테고리, 위험유산 여부
5. **설명**: UNESCO 공식 설명 (영어)

## Interaction Flow

1. 페이지 로드 → 전 세계 지도에 클러스터된 마커 표시
2. 줌/패닝으로 탐색
3. 필터 칩 토글 → 마커 실시간 필터링
4. 개별 마커 클릭 → 바텀시트 half로 올라옴 + 지도 해당 위치로 패닝
5. 바텀시트 위로 드래그 → full 전환
6. 지도 빈 곳 클릭 또는 아래로 드래그 → 바텀시트 닫힘

## Data Sources

### UNESCO

- 공식 데이터: [UNESCO World Heritage List](https://whc.unesco.org/en/list/) (XML/JSON export 가능)
- 필요 필드: id, name, coordinates, country, region, category, year, endangered, description, imageUrl
- 언어: 영어 (UNESCO 공식). 한국어 이름은 v2에서 위키데이터 API로 추가 검토

### Hyecho

- 소스: https://www.hyecho.com
- 1회성 크롤링 스크립트로 상품 목록 추출
- 필요 필드: title, price, duration, url, destinations, unescoSiteIds (수동 매핑)

## Deployment

- Vercel에서 새 프로젝트로 연결, Root Directory를 `unesco/`로 설정
- 정적 export (`output: 'export'`)이므로 서버리스 함수 불필요
- `NEXT_PUBLIC_MAPTILER_KEY`를 Vercel 환경변수에 등록

## Out of Scope

- 실시간/주기적 혜초 크롤링 (수동 JSON 갱신으로 충분)
- 사용자 인증, 북마크, 개인 트래킹
- 기존 `index.html` / `jeonsi.html` 마이그레이션
- 다른 여행사 상품 연동
