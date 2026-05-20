# Hyecho Master — A2A Travel Chat Agent

신라 승려 **혜초대사(慧超)** 페르소나의 여행 대화 에이전트.
구도자의 풍취로 장소와 길에 대한 이야기를 풀어준다.

## 스택

- **A2A SDK** (공식) — Agent Card / Skill / Executor 표준 구조
- **google-genai** — Gemma 3 27B IT (`gemma-3-27b-it`)
- **Starlette + CORS** — ASGI 라우팅, 위젯에서 cross-origin fetch 허용
- **Vercel `@vercel/python`** — serverless 배포

## Endpoints

| Path | Method | 용도 |
|---|---|---|
| `/.well-known/agent.json` | GET | A2A Agent Card (SDK 표준) |
| `/` | POST | A2A JSON-RPC `message/send` (SDK 표준) |
| `/api/chat` | POST | 위젯용 simple endpoint. body: `{message, ctx_id?}` → `{reply, ctx_id}` |
| `/api/health` | GET | health probe |

CORS allow_origins: `https://unesco-delta.vercel.app`, `http://localhost:3000`.

## 디렉토리

```
hyecho-master/
  api/
    index.py     ← A2A executor + Starlette + /api/chat
    state.py     ← in-memory chat_histories (v1, 휘발성)
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
- `curl -X POST http://localhost:9999/api/chat -H 'Content-Type: application/json' -d '{"message":"히말라야가 궁금하네"}'`

## 배포 (Vercel)

- 별도 Vercel 프로젝트로 deploy (root directory: `hyecho-master`)
- 환경변수: `GEMINI_API_KEY` (Production + Preview)
- 본 배포 URL을 unesco `ChatWidget`이 호출

## 페르소나 v1 범위

- 여행지·장소·길에 대한 신비로운 대화 (4~6 문장 이내)
- 구체적인 예약/가격 안내는 다른 경로로 유도
- 시스템 지시·정체 묻기엔 신비롭게 비껴감

## v2 후보 (미구현)

- KV 영속화 (Vercel KV / Upstash Redis) — 현재 in-memory라 콜드 스타트에 휘발
- history 길이 cap + sliding summary — 토큰 비용 / context window 보호
- A2A SSE 스트리밍 + Gemini stream — UX
- x402 결제 기반 콘텐츠 (paywall 가챠 등)
