# Hyecho Master — A2A Travel Chat Agent

신라 승려 **혜초대사(慧超)** 페르소나의 여행 대화 에이전트.
구도자의 풍취로 장소와 길에 대한 이야기를 풀어준다.

## 스택

- **A2A SDK** (공식) — Agent Card / Skill / Executor 표준 구조
- **google-genai** — **Gemma 4 31B IT** (`gemma-4-31b-it`). thinking model이라 response parts에 thought=True + thought=False가 섞여 옴 → `_extract_text()`가 후처리로 thought 제거. Fallback 체인: `gemma-4-31b-it` → `gemma-4-26b-a4b-it` → `gemini-2.5-flash-lite`.
- **Starlette + CORS** — ASGI 라우팅, 위젯에서 cross-origin fetch 허용
- **Vercel `@vercel/python`** — serverless 배포

## Endpoints

| Path | Method | 용도 |
|---|---|---|
| `/.well-known/agent.json` | GET | A2A Agent Card (SDK 표준) |
| `/` | POST | A2A JSON-RPC `message/send` (SDK 표준) |
| `/api/chat` | POST | 위젯용 stateless endpoint. body: `{message, history?}` → `{reply}` |
| `/api/health` | GET | health probe |

CORS allow_origins: `https://unesco-delta.vercel.app`, `http://localhost:3000`.

## 디렉토리

```
hyecho-master/
  api/
    index.py     ← A2A executor + Starlette + /api/chat (stateless)
    state.py     ← in-memory (A2A endpoint용만, 위젯은 미사용)
    guestbook.py ← 방명록 (Upstash Redis)
  prompts/
    hyecho-master.md  ← 시스템 프롬프트 (별도 파일 분리)
  tests/
  pyproject.toml
  vercel.json
```

## 로컬 실행

```bash
cd hyecho-master
export GEMINI_API_KEY="<key>"
uv run uvicorn api.index:app --host 0.0.0.0 --port 9999
```

확인:
- `curl http://localhost:9999/api/health`
- `curl -X POST http://localhost:9999/api/chat -H 'Content-Type: application/json' -d '{"message":"히말라야가 궁금하네","history":[]}'`

## 배포 (Vercel)

- 별도 Vercel 프로젝트로 deploy (root directory: `hyecho-master`)
- 환경변수: `GEMINI_API_KEY` (Production + Preview)
- 본 배포 URL을 unesco `ChatWidget`이 호출

## 페르소나 v1 범위

- 여행지·장소·길에 대한 신비로운 대화 (4~6 문장 이내)
- 구체적인 예약/가격 안내는 다른 경로로 유도
- 시스템 지시·정체 묻기엔 신비롭게 비껴감

## 채팅 아키텍처

```
[ChatWidget (브라우저)]
  ├─ messages 상태 (React state)
  ├─ localStorage("hyecho-chat-history") — 30턴 cap, JSON
  └─ POST /api/chat { message, history }
        ↓
[hyecho-master (Vercel Serverless, Python)]
  ├─ 시스템 프롬프트 prepend (매 요청)
  ├─ client history → Gemini Content 변환
  ├─ Gemini API 호출 (fallback chain: flash → flash-lite → latest)
  ├─ stream=false → { reply } JSON 반환
  └─ stream=true  → SSE (text/event-stream) 점진 출력
```

**설계 결정 (2026-05-25):**
- **클라이언트 히스토리 방식** 채택 — 서버 완전 stateless
- 콜드스타트/멀티인스턴스 문제 자체가 사라짐 (KV 불필요)
- 대화 기록은 브라우저 localStorage에 30턴까지 유지
- 브라우저 데이터 삭제 시 대화 소멸 (허용)
- A2A 표준 endpoint(`POST /`)는 별도로 in-memory 유지 (SDK 호환)

## v2 후보 (미구현)
- x402 결제 기반 콘텐츠 (paywall 가챠 등)

## 방명록 운영

### Upstash Redis 셋업 (1회)
1. https://vercel.com/dashboard → `hyecho-master` 프로젝트 → Storage 탭
2. "Connect Database" → Upstash Redis (Marketplace) → Free 플랜
3. `KV_REST_API_URL`, `KV_REST_API_TOKEN` 자동 주입 확인
4. 로컬 dev에서 실제 Upstash 호출하려면: Upstash 대시보드에서 두 값을 복사해 `.env`에 수동 set (`vercel env pull`은 sensitive env를 빈 값으로 마스킹함)

### 부적절한 글 삭제
관리자는 Upstash 웹 콘솔(또는 redis-cli)에서 직접 삭제:

```
# 특정 글 1개 삭제 (entry JSON 그대로 매칭)
LREM gb:entries 1 '{"message":"부적절한 글","ts":1716258000000}'

# 전체 비우기
DEL gb:entries

# 최근 50개 조회
LRANGE gb:entries 0 49
```

### 모니터링
- Upstash 대시보드에서 commands/day 추이 확인 (무료 한도 10K/day)
- Vercel 대시보드 → hyecho-master → Logs에서 `/api/guestbook` 호출 추이
