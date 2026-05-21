# 방명록 (Guestbook) — 디자인 스펙

**대상**: unesco-delta.vercel.app
**작성일**: 2026-05-21
**상태**: 디자인 승인됨 (구현 plan 작성 예정)

---

## 1. 목표

- 모든 사용자가 익명으로 한 줄 메시지를 남기고 다른 사용자의 메시지를 볼 수 있는 단순 방명록
- 데스크탑: 혜초대사 트리거 우측에 별도 트리거
- 모바일: 혜초대사 책갈피 아래에 별도 트리거
- Pilgrim Manuscript 디자인 톤 유지

## 2. 결정 사항 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 공개 범위 | 모두 공개 (전통 방명록) |
| 작성 폼 필드 | **메시지만** (완전 익명, 이름·이메일 받지 않음) |
| 스팸 방지 | 최소 — 길이 제한 + IP rate limit. 관리자 수동 삭제 |
| 인프라 | Upstash Redis (Vercel marketplace, free tier) — hyecho-master에 endpoint 추가 |

## 3. 아키텍처

```
unesco/components/GuestbookWidget.tsx   (Next.js client component, 신규)
    │ fetch
    ▼
hyecho-master/api/index.py              (기존 Starlette ASGI app 확장)
  ├ GET  /api/guestbook                 ← 최신 50개 조회
  └ POST /api/guestbook                 ← 새 글 작성
    │ HTTPS REST
    ▼
Upstash Redis                           (free tier, ~10K commands/day)
  ├ KEY: gb:entries  (LIST)             ← 글 자체 (최근 1000개 보관)
  └ KEY: gb:rate:<ip_hash>  (STRING, TTL 60s)  ← 분당 1개 rate limit
```

## 4. 데이터 모델

Redis LIST `gb:entries`의 각 엔트리 (JSON 직렬화):

```json
{ "message": "한 줄 메시지", "ts": 1716258000000 }
```

- 별도 ID 없음. `ts`(epoch ms)가 자연 식별자 역할
- IP 자체는 저장 안 함. 별도 key `gb:rate:<sha256(ip).hex[:16]>`에 카운터만 + TTL 60초 (rate limit 용)
- `LTRIM 0 999`로 최대 1000개만 유지 (LIST 무한 증가 방지)

## 5. API

### GET `/api/guestbook?limit=50`
- Redis: `LRANGE gb:entries 0 (limit-1)`
- 각 엔트리 JSON parse — try/catch로 손상된 엔트리는 skip + `logger.warning` (운영자가 redis-cli로 수동 push할 때 잘못된 JSON 들어갈 수 있음)
- 배열로 반환
- 응답: `200` `[{ message, ts }, ...]` (최신순)
- 빈 list도 `200 []`

### POST `/api/guestbook`
- 요청: `{ "message": "string" }`
- 처리:
  1. message 검증: trim 후 1~280자 (1자 미만 또는 280자 초과 시 `400`)
  2. **Client IP 추출** (Vercel serverless 환경):
     - 1순위 `request.headers["x-forwarded-for"]`의 첫 번째 값 (`split(",")[0].strip()`)
     - 2순위 `request.headers["x-real-ip"]`
     - fallback `request.client.host`
     - ⚠️ `request.client.host`만 쓰면 Vercel 내부 proxy IP라 모든 사용자가 한 IP로 잡혀 rate limit이 글로벌 1분 1개가 됨 — 반드시 헤더 우선
  3. IP hash 계산: `sha256(client_ip).hex[:16]`
  4. **Rate limit (atomic)** — Upstash `/pipeline`로 두 명령:
     ```
     SET gb:rate:<ip_hash> 1 NX EX 60   ← 키 없으면 1로 set + 60초 TTL
     INCR gb:rate:<ip_hash>              ← 값 증가
     ```
     INCR 결과 > 1이면 `429` 응답 (첫 호출이면 SET이 성공해 1, INCR이 2가 되니 — 그래서 INCR 결과 ≥ 2이면 두 번째 시도 의미)
     - 더 단순한 대안: `INCR` 호출 후 결과가 1이면 `EXPIRE 60` 별도 호출. 단 atomic 아님 → 첫 INCR과 EXPIRE 사이 race 가능. pipeline 권장.
  5. 엔트리 JSON: `{ message: trimmed, ts: now_ms }`
  6. **글 추가 (atomic)** — Upstash `/pipeline`로 두 명령:
     ```
     LPUSH gb:entries <json>
     LTRIM gb:entries 0 999
     ```
  7. 응답: `201` `{ message, ts }`

### CORS
이미 hyecho-master의 `_ALLOWED_ORIGIN_REGEX = r"https://unesco(-[\w-]+)?\.vercel\.app"`로 모든 unesco preview/production alias 허용 + `http://localhost:3000` 허용. 추가 작업 불필요.

### Upstash 호출 방식
`httpx` AsyncClient로 Upstash REST API 직접 호출:
- `POST https://<endpoint>/lpush/<key>/<value>` 등
- Authorization: `Bearer <TOKEN>`
- 추가 의존성 불필요 (httpx는 a2a-sdk에 이미 포함)

## 6. Frontend

### GuestbookWidget.tsx (구조는 ChatWidget과 유사)

**Props (부모에서 주입)**
- `open: boolean` — 현재 열려있는지 (state는 부모인 `app/page.tsx`가 관리, 아래 *상호 배타 규칙* 참조)
- `onOpenChange: (open: boolean) => void`

**내부 상태**
- `entries: { message, ts }[]`
- `input: string`
- `loading: boolean` — 첫 GET 진행 중 (Upstash cold start 1-2초 대비 spinner 표시용)
- `sending: boolean` — POST 진행 중
- `loadError: boolean`
- `postErrorMsg: string | null` — 인라인 에러 메시지

**효과**
- 컴포넌트 마운트 시 `GET /api/guestbook` 호출 → `entries` set, `loading` false 전환
- 작성 성공 시 응답을 `entries` 맨 위에 prepend
- 입력 폼은 **single-line `<input type="text">`** (textarea 아님) — 줄바꿈 자동 금지, "한 줄" 의도 강제

**트리거 (닫힌 상태)**

데스크탑: 혜초대사 트리거 우측에 인접한 paper card
```tsx
className="hidden md:flex absolute bottom-5 left-[268px] z-10 ..."  // 혜초대사 trigger 너비(~248) + 20px gap
```
한자 `言` + "방명록" 라벨

모바일: 혜초대사 책갈피 아래
```tsx
top: "298px"  // 혜초대사 top(204) + height(80) + 14px gap
right: "12px"
width: 80, height: 80
```
한자 `言` + "방명록" 라벨

### Panel (열린 상태)

데스크탑: **우하단** — 혜초대사 panel(좌하단)과 분리되어 둘 동시에 열어도 안 겹침. RankingPanel(top 110 ~ bottom calc(100dvh-200))과는 세로 영역 일부 겹치지만 ChatWidget이 RankingPanel보다 위에 떠 있는 것과 동일하게 z-20 사용.

```tsx
className="hidden md:flex absolute bottom-3 right-3 z-20 ..."
width: 380px, height: 540px
```

모바일: 혜초대사와 동일한 패턴 — 화면 하단 시트 (height 55dvh).

**상호 배타 규칙 (모바일)** — 두 panel이 같은 영역(하단 시트)을 점유하므로 동시 표시 불가. 방명록 트리거 클릭 시 혜초대사 panel이 열려 있다면 자동으로 닫고 방명록을 연다. 데스크탑에선 좌/우로 분리되므로 동시 표시 가능.

**구현**: `app/page.tsx`에 `openWidget: "chat" | "guestbook" | null` state를 두고 `ChatWidget`/`GuestbookWidget` 각각에 `open={openWidget === "..."} onOpenChange={(o) => setOpenWidget(o ? "..." : null)}` prop 주입. 두 widget이 서로 모르는 채로도 자연스럽게 상호 배타 동작.
- 데스크탑에서도 같은 패턴 사용 — 다만 둘 동시 표시 허용하려면 각자 독립 state 가능. **단순화 위해 모바일/데스크탑 모두 1개만 열림**으로 통일 (인지 부하 ↓, 사용자가 "지금 뭐가 열려있는지" 명확).

### Panel 내용

```
┌────────────────────────────────────┐
│ 言 방명록                       ×  │
│ 길벗들의 발자취                    │
├────────────────────────────────────┤
│                                    │
│ ┌──────────────────────────┐       │
│ │ 누군가 다녀간 메시지...   │       │
│ │ 5/21 14:23               │       │
│ └──────────────────────────┘       │
│ ┌──────────────────────────┐       │
│ │ 다른 메시지              │       │
│ │ 5/21 12:01               │       │
│ └──────────────────────────┘       │
│   ...                              │
│                                    │
├────────────────────────────────────┤
│ [한 줄 남기기...              ] 새김 │
└────────────────────────────────────┘
```

- 메시지 카드: paper-200 배경, serif-kr 본문, 단청 적색 작은 timestamp
- 입력 폼: ChatWidget input과 동일 스타일 (16px font, 16px 이상 → iOS zoom 방지)
- 작성 버튼 라벨: **"새김"** (Pilgrim 톤 — 글을 새긴다는 의미)
- 빈 상태: `display-italic` "아직 발자취가 없네. 첫 글을 남겨보게."

## 7. 에러 처리

| 상황 | UX |
|---|---|
| GET 로딩 중 (Upstash cold start) | `loading=true` → "발자취를 읽어오는 중…" spinner |
| GET 실패 (네트워크/500) | "발자취를 읽어올 수 없네…" + retry 버튼 |
| GET 일부 엔트리 손상 (JSON parse 실패) | 백엔드에서 skip + warning log, 사용자 화면엔 노출 안 함 |
| POST 길이 위반 (400) | 인라인 "한 줄로, 280자 이내로 남겨주시게" |
| POST rate limit (429) | 인라인 "잠시 후 다시 와주시게" |
| POST 기타 실패 (500) | "지금은 기록을 새길 수 없네…" |
| 빈 list | "아직 발자취가 없네. 첫 글을 남겨보게." |

기술 에러 메시지(stack trace 등)는 노출하지 않음 — 모두 페르소나 톤.

## 8. 운영 / 관리자

- **삭제는 별도 API endpoint 없음**. 운영자가 redis-cli 또는 Upstash 웹 콘솔로 직접:
  ```
  LREM gb:entries 1 '<entry-json-그대로>'
  ```
  또는 전체 비우기: `DEL gb:entries`
- `hyecho-master/README.md`에 운영 명령 예시 추가 (별도 섹션)

## 9. 환경변수 (hyecho-master 프로젝트에 추가 필요)

| KEY | 위치 | 용도 |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Vercel env (production, preview, development) | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel env (sensitive) | Upstash 인증 토큰 |

Upstash 셋업: Vercel marketplace → Upstash Redis Integration → 자동으로 위 두 env가 hyecho-master에 주입됨 (수동 set 불필요).

## 10. 테스트

V1 범위 — 단순 기능이라 자동 테스트 생략. 수동 검증 시나리오:
1. GET 빈 상태 → 빈 list 표시
2. POST 정상 메시지 → 201 + 즉시 list 맨 위에 표시
3. POST 1초 이내 두 번째 → 429 + 인라인 메시지
4. POST 281자 → 400 + 인라인 메시지
5. POST 빈 문자열 → 400 + 인라인 메시지
6. 페이지 새로고침 → 작성한 글 그대로 보임 (Redis 영속화 확인)
7. 데스크탑 트리거 위치 — 혜초대사 트리거와 겹치지 않음
8. 모바일 책갈피 — 혜초대사 책갈피 아래에 정확히 위치

## 11. 비기능 / 비용

- Upstash free tier (10K commands/day, 256MB) — 추정 사용량 1,200 commands/day (12%)
- 응답 latency: Upstash 같은 region이면 <100ms (Vercel은 IAD 또는 ICN 라우팅)
- 14일 idle 시 cold start ~1-2초 — 무시 가능

## 12. 범위 외 (의도적 미포함)

- 좋아요/공감 — V1엔 없음
- 페이지네이션 — 최신 50개로 충분
- 작성자 본인 글 삭제 — 익명이라 본인 식별 어려움
- 욕설/스팸 자동 필터 — 관리자 수동 삭제로 충분
- 알림 — 익명이라 알림 대상 없음
- ChatWidget ↔ GuestbookWidget 공통 컴포넌트 추출 — 거의 동일 구조지만 V1은 복붙으로 진행. V2에 `BookmarkPanel` 같은 추상화 고려.
- Backup/Export — Upstash free tier는 자동 백업 없음. 운영자가 필요시 `LRANGE 0 -1` 수동 export.
