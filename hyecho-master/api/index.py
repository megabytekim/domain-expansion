"""혜초대사 — A2A chat agent with simple widget endpoint.

Endpoints:
  GET  /.well-known/agent.json   ← A2A Agent Card (SDK 표준)
  POST /                          ← A2A JSON-RPC message/send (SDK 표준)
  POST /api/chat                  ← 간소화 chat endpoint (위젯용)
  GET  /api/health                ← health probe
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from google.genai import types as genai_types

from api.state import gemini_client, chat_histories

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, TaskNotCancelableError
from a2a.utils import new_agent_text_message
from a2a.utils.errors import ServerError

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route


# ---------------------------------------------------------------------------
# 시스템 프롬프트 (별도 파일에서 로드)
# ---------------------------------------------------------------------------

SYSTEM_INSTRUCTION = (Path(__file__).resolve().parent.parent / "prompts" / "hyecho-master.md").read_text()

import asyncio
import logging

logger = logging.getLogger("hyecho-master")

# 이 키의 free tier에서 작동 확인된 모델만 chain에 둠 (2026-05-20 probe 기준).
# 순서는 품질 → 안정 → alias 순. 앞 모델이 5xx/429면 다음으로 fallback.
MODEL_CANDIDATES = [
    "gemini-2.5-flash",        # 품질 우선 (다만 503 잦음)
    "gemini-2.5-flash-lite",   # 안정 fallback (1~2s)
    "gemini-flash-latest",     # 마지막 alias (라우팅 다를 수 있음)
]
MODEL = MODEL_CANDIDATES[0]  # Agent Card 노출용

# 모든 모델이 실패했을 때 사용자에게 보여줄 페르소나 메시지.
# 기술 에러를 그대로 노출하지 않고 페르소나 톤 유지.
FINAL_FALLBACK_REPLY = (
    "허허, 오늘은 이 노승의 눈앞에 안개가 너무 짙어 길을 보지 못하겠네…\n\n"
    "잠시 시간을 두고 다시 물어보시게. "
    "혹 자네의 발걸음이 급하다면, 이 길을 빚은 '개발자'라는 자에게 사정을 전해보게."
)


async def _generate_reply(ctx_id: str, user_text: str) -> str:
    """Gemini 호출 + 멀티턴 히스토리 관리. executor와 /api/chat 양쪽이 공유."""
    if ctx_id not in chat_histories:
        # system_instruction 정식 지원 모델에서도 동일하게 동작하도록 첫 turn에 inject
        chat_histories[ctx_id] = [
            genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=f"[시스템 지시]\n{SYSTEM_INSTRUCTION}\n\n위 지시를 따라 대화하게.")],
            ),
            genai_types.Content(
                role="model",
                parts=[genai_types.Part(text="자네가 왔구나. 길의 이야기라면 무엇이든 물어보게.")],
            ),
        ]

    history = chat_histories[ctx_id]
    history.append(
        genai_types.Content(role="user", parts=[genai_types.Part(text=user_text)])
    )

    last_exc: Exception | None = None
    for attempt, model_name in enumerate(MODEL_CANDIDATES):
        try:
            response = await gemini_client.aio.models.generate_content(
                model=model_name,
                contents=history,
            )
            text = response.text or "(답이 흩어졌네…)"
            history.append(
                genai_types.Content(role="model", parts=[genai_types.Part(text=text)])
            )
            return text
        except Exception as exc:
            last_exc = exc
            logger.warning("model %s failed (attempt %d): %s", model_name, attempt + 1, str(exc)[:200])
            await asyncio.sleep(0.4 * (attempt + 1))

    # 모든 모델 실패 — 사용자 메시지 rollback + 페르소나 fallback
    history.pop()
    logger.error("all models failed for ctx=%s: %s", ctx_id, last_exc)
    return FINAL_FALLBACK_REPLY


# ---------------------------------------------------------------------------
# A2A Executor (표준 SDK 인터페이스)
# ---------------------------------------------------------------------------


class HyechoMasterExecutor(AgentExecutor):
    """A2A agent — 혜초대사 페르소나로 대화."""

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        user_text = context.get_user_input()
        ctx_id = context.context_id or "default"
        reply = await _generate_reply(ctx_id, user_text)
        await event_queue.enqueue_event(new_agent_text_message(reply))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise ServerError(error=TaskNotCancelableError(message="Cancel not supported"))


skill = AgentSkill(
    id="travel-chat",
    name="길의 이야기",
    description="여행지·장소·길에 대해 옛 구도자 혜초대사의 풍취로 풀어주는 대화",
    tags=["travel", "korean", "philosophical", "hyecho"],
    examples=[
        "히말라야가 궁금해요",
        "이번 여행에서 무엇을 봐야 할까요?",
        "산티아고 순례길은 어떤 곳인가요?",
    ],
)

agent_card = AgentCard(
    name="Hyecho Master",
    description="신라 승려 혜초대사 페르소나의 여행 대화 에이전트. 옛 구도의 결로 길과 풍경을 풀어준다.",
    url=os.environ.get("AGENT_URL", f"https://{os.environ.get('VERCEL_URL', 'localhost:9999')}"),
    version="0.1.0",
    default_input_modes=["text"],
    default_output_modes=["text"],
    capabilities=AgentCapabilities(streaming=False),
    skills=[skill],
)

request_handler = DefaultRequestHandler(
    agent_executor=HyechoMasterExecutor(),
    task_store=InMemoryTaskStore(),
)

server = A2AStarletteApplication(agent_card=agent_card, http_handler=request_handler)


# ---------------------------------------------------------------------------
# 위젯용 간소화 endpoint + health
# ---------------------------------------------------------------------------


async def _chat_endpoint(request):
    """POST /api/chat — { message, ctx_id? } → { reply, ctx_id }."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    message = (body.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message required"}, status_code=400)

    ctx_id = (body.get("ctx_id") or "default").strip() or "default"
    reply = await _generate_reply(ctx_id, message)
    return JSONResponse({"reply": reply, "ctx_id": ctx_id})


async def _health(request):
    return JSONResponse({"status": "ok", "agent": "hyecho-master", "model": MODEL})


# ---------------------------------------------------------------------------
# 통합 ASGI app (CORS + A2A mount + 위젯용 endpoint)
# ---------------------------------------------------------------------------

_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
# unesco-*.vercel.app 모든 alias / preview deploy 허용
_ALLOWED_ORIGIN_REGEX = r"https://unesco(-[\w-]+)?\.vercel\.app"

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_origin_regex=_ALLOWED_ORIGIN_REGEX,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    ),
]

_a2a_app = server.build()

app = Starlette(
    routes=[
        Route("/api/health", _health, methods=["GET"]),
        Route("/api/chat", _chat_endpoint, methods=["POST", "OPTIONS"]),
        Mount("/", app=_a2a_app),
    ],
    middleware=middleware,
)
