"""Guestbook backend — Upstash Redis 기반 익명 방명록.

데이터:
  - LIST  gb:entries          최근 1000개 글 (JSON 직렬화)
  - STR   gb:rate:<ip_hash>   분당 1개 rate limit (TTL 60s)

이 파일은 helpers + GET/POST handler를 export 하고, index.py에서 라우팅한다.
"""

from __future__ import annotations

import hashlib
from typing import Any
import json
import logging
import os
import time

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("hyecho-master.guestbook")

MAX_MESSAGE_LEN = 280
MAX_ENTRIES = 1000
RATE_LIMIT_TTL = 60       # seconds
DEFAULT_LIMIT = 50

ENTRIES_KEY = "gb:entries"


# ---------------------------------------------------------------------------
# Client IP 추출
# ---------------------------------------------------------------------------

def _client_ip(request: Request) -> str:
    """Extract client IP for rate-limiting.

    Vercel serverless의 request.client.host는 내부 proxy IP. 반드시 X-Forwarded-For
    헤더의 첫 번째 값을 우선 사용해야 사용자별 rate limit이 의미를 가진다.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    if request.client and request.client.host:
        return request.client.host
    return "0.0.0.0"


def _ip_hash(ip: str) -> str:
    """Stable 16-char hex hash of an IP (sha256 prefix)."""
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Upstash REST helper
# ---------------------------------------------------------------------------

async def _upstash_call(commands: list[Any], *, pipeline: bool = False) -> Any:
    """Upstash REST API call.

    pipeline=False: commands = ["LPUSH", "key", "value"] → POST /
    pipeline=True : commands = [["LPUSH",..], ["LTRIM",..]] → POST /pipeline

    Returns the parsed JSON response.
    """
    base = os.environ.get("KV_REST_API_URL", "").rstrip("/")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not base or not token:
        raise RuntimeError("KV_REST_API_URL / TOKEN env not set")
    url = f"{base}/pipeline" if pipeline else base
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.post(url, json=commands, headers=headers)
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# GET handler — 엔트리 조회
# ---------------------------------------------------------------------------

async def fetch_entries(limit: int = DEFAULT_LIMIT) -> list[dict]:
    """Return latest `limit` entries (most recent first)."""
    n = max(1, min(limit, MAX_ENTRIES))
    raw = await _upstash_call(["LRANGE", ENTRIES_KEY, "0", str(n - 1)])
    result = raw.get("result") if isinstance(raw, dict) else raw
    out: list[dict] = []
    for item in (result or []):
        try:
            out.append(json.loads(item))
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("skipping corrupted guestbook entry: %r (%s)", item, exc)
    return out


async def get_handler(request: Request) -> JSONResponse:
    """GET /api/guestbook?limit=50"""
    try:
        limit = int(request.query_params.get("limit", DEFAULT_LIMIT))
    except ValueError:
        limit = DEFAULT_LIMIT
    try:
        entries = await fetch_entries(limit=limit)
        return JSONResponse(entries)
    except Exception:
        logger.exception("GET /api/guestbook failed")
        return JSONResponse({"error": "fetch failed"}, status_code=500)


async def post_handler(request: Request) -> JSONResponse:
    """POST /api/guestbook — { message } 받아 새 글 작성.

    - 280자 제한
    - 분당 1개 rate limit (IP 기준)
    """
    # 1. body parse
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    raw_message = body.get("message") if isinstance(body, dict) else None
    message = (raw_message or "").strip() if isinstance(raw_message, str) else ""
    if len(message) < 1 or len(message) > MAX_MESSAGE_LEN:
        return JSONResponse({"error": f"message length 1..{MAX_MESSAGE_LEN}"}, status_code=400)

    # 2. rate limit (pipeline: SET NX EX 60 + INCR)
    # NOTE: Upstash /pipeline is sequential but NOT atomic across commands.
    # Two truly-concurrent requests from same IP could both pass — acceptable
    # for personal guestbook. For strict atomicity, use Lua via /eval.
    ip = _client_ip(request)
    rate_key = f"gb:rate:{_ip_hash(ip)}"
    try:
        pipe_result = await _upstash_call(
            [
                ["SET", rate_key, "0", "NX", "EX", str(RATE_LIMIT_TTL)],
                ["INCR", rate_key],
            ],
            pipeline=True,
        )
    except Exception:
        logger.exception("rate-limit pipeline failed")
        return JSONResponse({"error": "rate limit failed"}, status_code=500)

    # pipe_result is list of {"result": ...}
    try:
        incr_value = int(pipe_result[1]["result"])
    except (KeyError, TypeError, IndexError, ValueError):
        logger.error("unexpected pipeline result: %r", pipe_result)
        return JSONResponse({"error": "rate limit malformed"}, status_code=500)
    if incr_value > 1:
        return JSONResponse({"error": "rate limited"}, status_code=429)

    # 3. 작성 (atomic pipeline: LPUSH + LTRIM)
    entry = {"message": message, "ts": int(time.time() * 1000)}
    entry_json = json.dumps(entry, ensure_ascii=False)
    try:
        await _upstash_call(
            [
                ["LPUSH", ENTRIES_KEY, entry_json],
                ["LTRIM", ENTRIES_KEY, "0", str(MAX_ENTRIES - 1)],
            ],
            pipeline=True,
        )
    except Exception:
        logger.exception("write pipeline failed")
        return JSONResponse({"error": "write failed"}, status_code=500)

    return JSONResponse(entry, status_code=201)
