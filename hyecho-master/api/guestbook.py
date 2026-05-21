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
