# 학습 노트 — 2026-05-22 작업 정리

오늘 작업을 학습용으로 정리. 큰 그림 → 모듈별 결정점 → 코드 위치 순.

## 목차

0. [큰 그림: 무엇이 변했나](#0-큰-그림-무엇이-변했나)
1. [백두산 1400명 버그 → dedupe](#1-백두산-1400명-버그--dedupe)
2. [데이터 복구 워크플로우](#2-데이터-복구-워크플로우)
3. [크롤러 시스템 정비](#3-크롤러-시스템-정비)
4. [systemd timer (자동화)](#4-systemd-timer-자동화)
5. [~/.env 셋업](#5-env-셋업)
6. [UI 개선 라운드 — 디자인 결정 모음](#6-ui-개선-라운드--디자인-결정-모음)
7. [build-id 자동 reload 시스템](#7-build-id-자동-reload-시스템)
8. [권장 코드 학습 순서](#8-권장-코드-학습-순서)
9. [남은 follow-up](#9-남은-follow-up)

---

## 0. 큰 그림: 무엇이 변했나

**시작점:**
- 백두산 패키지가 1400명으로 표시 → 어딘가 망가짐
- 크롤러 = 수동 트리거, 가끔 dry-run에서 잘못된 데이터 production 흘러감
- 데스크탑에서 패키지 클릭하면 BottomSheet이 지도 절반 가림
- 다른 사용자가 옛 캐시 코드 봄

**끝점:**
- 자동화된 주간 crawl + safety net + 동명이지 outlier 자동 제거
- 데스크탑/모바일 별도 layout (SidePanel vs BottomSheet)
- 지도 hover popup, drill-in UX 개선, 자동 reload 시스템

---

## 1. 백두산 1400명 버그 → dedupe

### 문제
백두산 패키지에 270개 출발 일정 표시 → 1400명 예약. 실제는 45개 출발 / 240명.

### 원인 (조사)
혜초 API `getGoodsEventList.json?startDay=YYYYMM01`은 **`startDay` 파라미터를 무시하고 매번 전체 향후 출발일을 반환**한다. crawler가 6개 month를 호출하면 같은 45개가 6번씩 push됨.

### 결정점
**왜 단순 dedupe로 fix했나** (API 호출 자체를 1번으로 줄이지 않고)
- API 동작이 항상 그런지 확신 없음 — 예전엔 month 필터 작동했을 수도
- 안전한 길: 결과를 그대로 받되 `eventSeq` 기준 Set으로 dedupe
- 호출 횟수 더 늘어도 안전 우선

### 코드
- `unesco/scripts/crawl-all-hyecho.ts:155-195` `fetchDepartures` 함수
- `eventSeq Set`으로 중복 차단

---

## 2. 데이터 복구 워크플로우

### 결정점: 즉시 production rollback
production에 잘못된 1400명이 노출 → `vercel rollback`이 아니라 `vercel alias` 명령으로 이전 deployment를 가리키게 했다.

**왜 alias?**
- `vercel rollback`이 명령 자체로 안 보일 수 있음(브랜치 상태에 따라)
- alias는 명시적: "이 deployment를 이제부터 unesco-delta.vercel.app으로"
- 즉시 적용 (수초)

### 코드
```bash
vercel alias https://unesco-abdi6zz2p-... unesco-delta.vercel.app
```

이런 패턴은 앞으로 production 사고 시 그대로 쓰면 됨.

---

## 3. 크롤러 시스템 정비

### 시작 시 dedupe 안정망
- `crawl-all-hyecho.ts`의 fetchDepartures Set
- 같은 product를 여러 번 crawl해도 안전

### prune-outliers 후처리
**문제:** LLM이 한자 도시명을 영어로 transliteration → OSM nominatim이 동명이지 좌표 반환 (Leon→Texas, 集安→장시 지안). 직접 verification 28건 발견.

**결정:**
- A. country-aware geocoding (LLM에 좌표까지 요청) — 비용/복잡도 큼
- B. 후처리 단계로 outlier 제거 — 채택

**왜 median centroid 3000km?**
- mean centroid는 outlier가 자기 자신을 끌어당김 → robust 못함
- median은 outlier 영향 적음
- 3000km는 false positive 최소화 (1500km로 시도 시 진짜 long-haul 패키지 손상)
- 사용자 명시: "한두개 빠지는 건 괜찮음"

### 코드
- `unesco/scripts/prune-outliers.ts` (별도 step)
- `unesco/scripts/crawl.sh`에 `3c/4 prune-outliers` 단계 추가

### LLM extract 옵션 추가
- `--ids` (특정 product만 재시도)
- `BODY_MAX_CHARS 8000 → 24000` (28일+ 장기 패키지에서 도시 정보가 후반에)

---

## 4. systemd timer (자동화)

### 결정점: 주 1회 vs 매일

| 빈도 | 비용/월 | 데이터 신선도 |
|---|---|---|
| 매일 | ~$150 LLM | 거의 실시간 |
| 주 2회 | ~$40 | 충분 |
| **주 1회** | **~$20** | 적당 (혜초 데이터 변동 속도 고려) |

**선택: 주 1회 일요일 19:00 UTC = 한국 월요일 04:00**
- 한국 사용자가 월요일 아침 신선한 데이터
- 비용 최소

**Linger 설정** (`loginctl enable-linger ubuntu`)
- user systemd는 기본적으로 사용자 로그인 시에만 실행
- linger로 백그라운드 실행 가능

### 코드
- `~/.config/systemd/user/unesco-crawl.service` + `.timer`

---

## 5. ~/.env 셋업

`crawl.sh`가 source하는 envvar:
- `VERCEL_TOKEN` — deploy용
- `GITHUB_PAT` — Issue 발행용 (`validate-and-report.ts`)

**결정점: ~/.vercel-token vs ~/.env**
- `~/.vercel-token`은 수동 deploy 시 cat으로 읽음 (우리가 직접 명령 실행할 때)
- `~/.env`는 systemd timer가 unattended로 source
- 둘 다 유지 (중복 OK)

**보안 측면**
- `chmod 600` 필수
- fine-grained PAT 추천 (특정 repo + Issues:write만)
- 클래식 PAT은 `repo` scope 전체라 위험성 큼 — 사용자 동의 후 진행

---

## 6. UI 개선 라운드 — 디자인 결정 모음

### 6.1 데스크탑 SidePanel (BottomSheet 분리)

**문제:** BottomSheet이 데스크탑에서도 가로 풀너비 × 40% 차지 → 지도 절반 가림

**결정:**
- 모바일: BottomSheet 유지 (자연스러운 모바일 UX)
- 데스크탑(md+): floating SidePanel 좌측

**왜 좌측인가** (우측 아님)
- 우측은 인기순위(RankingPanel)가 이미 있음
- 좌상단 검색바/필터 chip과 좌하단 위젯 사이 빈 공간 활용

**왜 max-height: calc(100vh - 240px)**
- 좌하단 혜초대사/방명록 위젯과 겹치지 않도록
- 240px = 위쪽 검색바(80) + 아래쪽 위젯(160) 합

### 코드
- `unesco/components/SidePanel.tsx`
- `unesco/app/page.tsx`에서 `md:hidden` / `hidden md:flex` 분기

### 6.2 마커 hover popup에 thumbnail

**디자인 결정:** centroid hover 시 product 이미지 미리보기 + 제목

**구현 디테일:**
- 같은 product 위에 mouse 머무는 동안 DOM 재생성 안 함 (`lastPopupProductId` 추적)
- mouseleave 시 ref reset
- drill-in 모드에선 centroid popup 숨김 (`selectedProductIdRef` early return)

### 코드
- `unesco/components/UnescoMap.tsx:188-220` mousemove handler

### 6.3 drill-in zoom 완화

**문제:** 백두산 클릭 시 너무 가까이 zoom-in되어 평면지도처럼 보임 (globe 효과 사라짐)

**결정:**
- 단일 location: `Math.max(currentZoom, 6) → 4` (대륙 단위)
- multi: `maxZoom 8 → 5`

**왜 이 숫자?**
- zoom 4-5는 한 국가/지역 wide view — globe 느낌 유지
- 너무 멀면 마커 모임 안 보이고, 너무 가까우면 globe 사라짐

### 6.4 marker 숨김 — 4번의 시행착오 (가장 흥미로운 부분)

| 시도 | 결과 |
|---|---|
| 1. opacity 0.4 (살짝 dim) | 사용자: "더 dim 해줘" |
| 2. opacity 0 | dev에서는 작동, production에서도 잔재 보임 |
| 3. setFilter (legacy + expression 둘 다) | 안 먹음 |
| 4. setLayoutProperty visibility "none" | 안 먹음 |
| **5. source data에서 직접 제거** | **드디어 작동** |

**왜 1~4가 실패했나** (가설)
- maplibre globe projection + 우리 layer paint expression 조합에서 paint property 일부 update가 race condition
- 가장 확실한 방법: source.setData()로 features 자체를 줄임 → maplibre가 그릴 수 있는 정보 자체가 없음

**교훈:** maplibre에서 layer hide가 안 먹으면 **source data 자체를 줄여라**

### 코드
- `unesco/components/UnescoMap.tsx:292-336` markers source 갱신 useEffect

### 6.5 "🌍 전체 지도로" 버튼

**디자인 결정:**
- 우상단 → 하단 중앙 floating pill로 변경 (사용자 명시: "더 크게")
- vermillion border 양쪽 (좌/우)
- hover scale-up

**왜 하단 중앙?**
- 우상단은 maplibre nav control과 겹침
- 하단 중앙은 가장 눈에 띄는 위치 (모바일/데스크탑 공통)
- 우하단(모바일)은 위젯 trigger와 충돌

---

## 7. build-id 자동 reload 시스템

### 핵심 문제
이미 페이지 열어둔 사용자가 옛 코드 그대로 봄. 서버에서 client에 "새 버전 받으세요" push 할 표준 수단 없음.

### 옵션 분석

| 옵션 | 사용자 협조 | 비용 | 신뢰성 |
|---|---|---|---|
| 메시지로 안내 | 필요 | 0 | 100% (협조 시) |
| **Tab focus + build-id** | **불필요** | **거의 0** | **높음** |
| 5분 폴링 | 불필요 | 작음 | 매우 높음 (귀찮을 수도) |
| Service Worker | 불필요 | 셋업 비용 | 잘못하면 더 큰 캐시 문제 |

**B 선택 이유:**
- 사용자 자연스러운 행동(탭 전환)에 fit
- 입력 중 강제 reload 같은 거슬림 없음
- 일회성 셋업, 영구 작동

### 구현 3 파트
1. **next.config.ts**: `process.env.VERCEL_GIT_COMMIT_SHA || Date.now()` → `public/build-id.txt` 생성 + `NEXT_PUBLIC_BUILD_ID` env
2. **components/AutoReload.tsx**: `visibilitychange` 이벤트 listener → `/build-id.txt` fetch → 다르면 `location.reload()`
3. **app/layout.tsx**: `<AutoReload />` 최상단 마운트

### 캐시 layer 정리 (참고)

웹은 여러 캐시 layer가 있고 각각 다르게 다룬다:

| Layer | 작동 방식 | 우리 사이트 상태 |
|---|---|---|
| Vercel CDN | deploy + alias swap = 즉시 모든 edge에 새 버전 | 우리가 alias 옮길 때마다 자동 갱신 |
| 브라우저 HTML cache | `cache-control: max-age=0, must-revalidate` | 매번 서버에 묻고 ETag로 304 |
| 브라우저 JS/CSS chunk cache | 파일명에 hash (`135w0owmxkjn4.js`) → immutable 1년 | 새 chunk면 새 URL → 자동 새 fetch |
| 이미 열려있는 페이지 | reload 안 하면 영원히 옛 코드 | **여기가 진짜 문제 → AutoReload로 해결** |

---

## 8. 권장 코드 학습 순서

처음 보면 가장 흥미로운 순서:

1. **`scripts/crawl.sh`** — 전체 워크플로우 한눈에 (orchestrator)
2. **`scripts/crawl-all-hyecho.ts`** — Playwright + API dedup
3. **`scripts/llm-extract.ts`** — Claude haiku로 single-location product에서 도시 추출
4. **`scripts/prune-outliers.ts`** — 후처리, median centroid
5. **`scripts/validate-and-report.ts`** — 데이터 검증 + GitHub Issue
6. **`components/UnescoMap.tsx`** — 가장 복잡, useEffect 패턴이 많음
7. **`components/SidePanel.tsx`** vs **`components/BottomSheet.tsx`** — 같은 역할 다른 form factor
8. **`components/AutoReload.tsx`** — 작지만 영리한 캐시 무효화
9. **`app/page.tsx`** — 모든 component를 어떻게 조합하는지

---

## 9. 남은 follow-up

- `#40` UNESCO API 403 — `|| echo`로 임시 처리 중. Playwright fetch로 우회 가능 (다음 라운드)
- 동명이지 cache 오류 — 백두산 외에도 잠재. country-aware geocoding이 근본 해결
- LLM 90초 timeout — 가끔 fail. retry 또는 timeout 증가
- prune-outliers false positive — 진짜 long-haul과 동명이지 오류 구분 못함
