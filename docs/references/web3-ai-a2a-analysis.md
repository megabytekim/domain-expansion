# web3_ai의 A2A Gemini Agent 분석

**출처**: https://github.com/megabytekim/web3_ai (megabytekim 본인 repo)
**대상 경로**: `study/implemenation/a2a-gemini-agent/`
**배포**: https://a2a-gemini-agent.vercel.app
**분석 일자**: 2026-05-20
**목적**: 이 분석을 레퍼런스로 domain-expansion 모노레포에 자체 a2a 에이전트 1개 deploy

---

## 1. 한 줄 요약

A2A 공식 SDK + Gemma 3 27B IT + Starlette + Vercel serverless로 구축한 **"Agent M"** — Matrix 모피어스 페르소나의 챗 에이전트. x402 V2 결제 프로토콜과 연동된 "Soul Store"(영혼 저장소)로 대화를 가챠 아이템 + AI 요약 비문으로 보존하는 paywall 콘텐츠 기능 포함.

## 2. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│ Starlette ASGI (Vercel serverless)                           │
│                                                              │
│  /chat (HTML UI) ─┐                                          │
│  /soul-store ─┐    │                                         │
│  /api/soul-vault ─┐│ ← x402 V2:                              │
│                   ││   1) 402 + PAYMENT-REQUIRED 헤더         │
│                   ││   2) PAYMENT-SIGNATURE 헤더 verify       │
│                   ││   3) 200 + PAYMENT-RESPONSE 헤더         │
│                   ││                                         │
│  Mount("/", A2AStarletteApplication)                         │
│    ├─ GET  /.well-known/agent.json    (Agent Card)           │
│    └─ POST /                          (JSON-RPC message/send)│
│         └─ DefaultRequestHandler                             │
│             └─ GeminiChatExecutor                            │
│                 └─ Gemma 3 27B IT (google-genai SDK)         │
│                                                              │
│  Shared state (api/state.py, in-memory module singletons):   │
│    chat_histories[ctx_id]       ← 멀티턴 히스토리            │
│    soul_store_results[ctx_id]   ← x402 ↔ chat 크로스채널     │
└──────────────────────────────────────────────────────────────┘
```

## 3. 의존성

```toml
# pyproject.toml
dependencies = [
    "a2a-sdk[http-server]",   # 공식 A2A SDK
    "google-genai",            # Gemma 3 27B IT 호출
    "python-dotenv>=1.2.2",
    "uvicorn>=0.41.0",
]
```

- 패키지 매니저: `uv`
- Python: 3.12+

## 4. A2A SDK 사용 패턴 (표준)

```python
# Agent Card 구성
skill = AgentSkill(id="chat", name="깨달음의 대화", tags=["chat","gemini","morpheus"])
agent_card = AgentCard(
    name="Agent M",
    url=os.environ.get("AGENT_URL", f"https://{os.environ.get('VERCEL_URL', 'localhost:9999')}"),
    version="0.1.0",
    default_input_modes=["text"],
    default_output_modes=["text"],
    capabilities=AgentCapabilities(streaming=False),
    skills=[skill],
)

# Executor 정의
class GeminiChatExecutor(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        user_text = context.get_user_input()
        ctx_id = context.context_id or "default"
        reply = await self._get_gemini_response(ctx_id, user_text)
        await event_queue.enqueue_event(new_agent_text_message(reply))

    async def cancel(self, context, event_queue) -> None:
        raise ServerError(error=TaskNotCancelableError(message="Cancel not supported"))

# Server wiring
request_handler = DefaultRequestHandler(
    agent_executor=GeminiChatExecutor(),
    task_store=InMemoryTaskStore(),
)
server = A2AStarletteApplication(agent_card=agent_card, http_handler=request_handler)
_a2a_app = server.build()

# Mount as part of bigger Starlette app
app = Starlette(routes=[
    Route("/chat", _chat_ui),
    Route("/soul-store", _soul_store_ui),
    Route("/api/soul-vault", _soul_vault_api, methods=["GET", "OPTIONS"]),
    Mount("/", app=_a2a_app),
])
```

> 핵심: A2A SDK가 Starlette app을 빌드해주고 그걸 더 큰 Starlette 라우팅에 mount. 표준 A2A endpoints(`/.well-known/agent.json`, `POST /`)는 SDK가 알아서 처리.

## 5. 페르소나 디자인 — Agent M (62줄 system prompt)

- **컨셉**: Matrix의 모피어스. 깨달음을 주는 가이드
- **말투**: 한국어 + 모피어스식 반존대("~하게", "~이라네")
- **특수 능력**: "영혼 저장소(Soul Store)" 제안
- **제안 조건** (모두 충족해야 함):
  1. 최소 4턴 이상 대화 후
  2. 상대가 감동/깨달음/기억 욕구를 표현했을 때
  3. 단순 Q&A가 아닌 의미 있는 교류가 있을 때
- **제안 메커니즘**: `SOUL_STORE_LINK` 문자열을 그대로 출력 → executor가 post-process로 실제 URL(`/soul-store?ctx={ctx_id}`)로 치환
- **한 대화에 한 번만**, 거절당하면 재제안 금지

> 시스템 프롬프트가 단순 instruction 수준이 아니라 **character + 행동 규칙 + 조건부 트리거**까지 명시. 학습 데모를 넘은 에이전트 디자인.

## 6. A2A × x402 통합 — 가장 흥미로운 부분

| 단계 | 동작 |
|---|---|
| 1 | `/chat`에서 Agent M과 멀티턴 대화 |
| 2 | 사용자가 "이 대화 간직하고 싶다" 표현 → Gemma가 `SOUL_STORE_LINK` 토큰 출력 |
| 3 | executor가 post-process로 URL 치환: `/soul-store?ctx={ctx_id}` |
| 4 | `/soul-store` 페이지에서 x402 V2 흐름 실행 (USDC 0.10, Base Sepolia, EIP-712 시뮬레이션) |
| 5 | 결제 성공 → 가챠 아이템 뽑기 (가중치): 영혼석(50)/금고(25)/수정구(15)/불사조깃털(8)/네오선글라스(2) |
| 6 | Gemini로 대화 "비문" 요약 ("모피어스 말투로 3줄 이내") |
| 7 | `soul_store_results[ctx_id]`에 저장 → 다음 채팅 턴 executor가 pop → Agent M이 자연스럽게 축하 |

**즉**: A2A 에이전트가 사용자에게 **paywall 콘텐츠(가챠 + 요약)를 판매**하고, 그 결과를 다음 턴에서 **에이전트 페르소나로 인지하는 cross-channel state machine**. Web3 마이크로결제 + 캐릭터 IP 결합의 working prototype.

## 7. x402 V2 구현 (시뮬레이션)

- `NETWORK = "eip155:84532"` (Base Sepolia CAIP-2)
- `ASSET = "0x036CbD..."` (USDC on Base Sepolia)
- `PRICE = "100000"` (0.10 USDC, 6 decimals)
- V2 마이그레이션 흔적:
  - `accepts[]` 배열 구조 (V1의 단일 옵션 → V2 다중)
  - `accepted`/`payload` 분리
  - `transaction` 필드명 (V1의 `tx_hash` → V2 `transaction`)
- **EIP-712 실제 서명은 없음** — base64(JSON)로 시뮬레이션. README도 명시

## 8. 상태 관리

- `chat_histories: dict[str, list[Content]]` (in-memory)
- `soul_store_results: dict[str, dict]` (in-memory, A2A executor와 soul-vault endpoint 간 cross-channel)
- 둘 다 module singleton — **Vercel serverless 콜드 스타트 시 휘발**

## 9. 운영 흐름

- `main` 브랜치 → production (`a2a-gemini-agent.vercel.app`)
- `dev` 브랜치 → Vercel Preview 자동 생성
- Vercel 설정:
  - Root Directory: `study/implemenation/a2a-gemini-agent`
  - Framework: Other, Build: `@vercel/python`
  - Env: `GEMINI_API_KEY` (Production + Preview)
- 로컬: `uv run uvicorn api.index:app --host 0.0.0.0 --port 9999`

## 10. 테스트

22개 (pytest):
- `test_executor.py` — A2A executor 동작
- `test_x402.py` — x402 프로토콜 (V2 spec 준수)
- `test_soul_store.py` — 아이템 가챠 + 대화 요약
- `test_soul_vault.py` — `/api/soul-vault` end-to-end 통합 (402 → 서명 → 200)
- `test_client.py` — 수동 A2A 클라이언트 (서버 띄우고 직접 호출)

## 11. 평가: 잘된 점

1. ✅ A2A 공식 SDK 표준 구조 그대로 (Agent Card / Skill / Executor / RequestHandler / Application)
2. ✅ 단순 instruction이 아닌 **character-level 시스템 프롬프트**
3. ✅ x402 V2 spec 충실 (V1 → V2 마이그레이션 의식)
4. ✅ A2A + x402의 cross-channel state로 결제가 chat 흐름에 자연 통합
5. ✅ 22개 테스트로 protocol 동작 검증
6. ✅ dev/prod 워크플로우 + Vercel branch deploy 셋업 완료

## 12. 개선 후보 (우선순위)

| 우선 | 항목 | 이유 |
|---|---|---|
| 🔴 高 | **State 영속화** | in-memory 휘발 → 콜드 스타트에 대화 끊김. Vercel KV/Upstash Redis 필요 |
| 🔴 高 | **history 무한 증가 cap/요약** | 토큰 비용 + context window 초과 위험 |
| 🟡 中 | **streaming=False** | A2A SSE + Gemini stream 둘 다 지원하는데 안 씀. UX 손해 |
| 🟡 中 | **system_instruction 우회 트릭** | Gemma 미지원이라 첫 user turn에 인젝션 → history 영구 잔존. prefix caching 등 활용 가능 |
| 🟡 中 | **AgentCard `url` 동적** | Preview URL이 매번 바뀌어 외부 A2A 클라이언트가 안정적으로 잡기 어려움 |
| 🟢 低 | **InMemoryTaskStore** | 단순 채팅엔 영향 작지만 spec 일관성 ↓ |
| 🟢 低 | **payment-signature base64 JSON** | EIP-712 실제 서명 아님 (학습 목적은 OK) |
| 🟢 低 | **system prompt 인라인** | 62줄 → `prompts/agent_m.md` 분리하면 협업 용이 |

## 13. 우리가 a2a 에이전트 구축할 때 차용/회피 포인트

### 차용
- **A2A SDK + Starlette + Vercel `@vercel/python` 스택** 그대로 사용 가능 (배포 패턴 검증됨)
- **`Mount("/", a2a_app)` 패턴**으로 표준 endpoint + 커스텀 라우팅 병행
- **vercel.json**: `builds: [{src: "api/index.py", use: "@vercel/python"}]` 한 줄
- **GET `/.well-known/agent.json` + POST `/` JSON-RPC** 표준 노출
- **dev/main 브랜치 split → Vercel Preview/Production** 자동 분리 (domain-expansion에 이미 비슷한 흐름)
- **시스템 프롬프트 = 캐릭터 정의** 수준으로 작성 (단순 instruction 이상)

### 회피 / 개선
- ❌ in-memory state 그대로 가지 말 것 → **Vercel KV 또는 Upstash Redis 초기부터 도입**
- ❌ history cap 없음 → **N턴 또는 토큰 cap + sliding summary** 도입
- ❌ streaming=False → **A2A SSE + Gemini stream 활성화** (UX 크게 좋아짐, 단 Vercel timeout 고려)
- ❌ 시스템 프롬프트 인라인 → **별도 .md 파일로 분리** (협업/iteration 용이)

### 모델 선택
- web3_ai: Gemma 3 27B IT (`gemma-3-27b-it`, AI Studio 무료/저가 티어)
- 대안: Claude Sonnet/Haiku (anthropic SDK), GPT-4o (openai SDK)
- 한국어 페르소나 우선이면 Gemini/Gemma 또는 Claude 추천

### 페르소나 후보 (Agent M 외)
- 도메인 결정 따라 변경
- 예: 혜초여행 컨텍스트라면 "여행지 큐레이터"
- 예: domain-expansion 모노레포 컨텍스트라면 "투자/매크로 안내자"

---

**다음 액션 후보**:
1. domain-expansion 안에 `a2a-agent/` 디렉토리 신설
2. 페르소나/도메인 결정
3. A2A SDK + Gemini/Claude로 minimal executor 구현
4. Vercel KV 세팅 (state 영속화부터 시작)
5. dev/prod 브랜치 + Vercel preview alias 셋업
