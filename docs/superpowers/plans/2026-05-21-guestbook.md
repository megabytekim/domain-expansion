# 방명록 (Guestbook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** unesco-delta.vercel.app에 익명 방명록 기능 추가. 데스크탑은 혜초대사 트리거 우측, 모바일은 혜초대사 책갈피 아래.

**Architecture:** hyecho-master 백엔드에 `/api/guestbook` GET/POST endpoint 신설 + Upstash Redis 저장. unesco 프론트엔드에 `GuestbookWidget` 신설하고 `app/page.tsx`에서 `ChatWidget`과 함께 `openWidget` state로 상호 배타 관리.

**Tech Stack:** Python Starlette · httpx · Upstash Redis REST · Next.js 16 · React · TypeScript · Vercel

**Reference Spec:** `docs/superpowers/specs/2026-05-21-guestbook-design.md`

---

## File Structure

**Backend (hyecho-master)**
- Create: `hyecho-master/api/guestbook.py` — IP 추출, IP hash, Upstash REST helper, GET/POST handler
- Create: `hyecho-master/tests/__init__.py` — empty package marker
- Create: `hyecho-master/tests/test_guestbook.py` — unit tests with mocked Upstash
- Modify: `hyecho-master/api/index.py` — route 등록
- Modify: `hyecho-master/README.md` — 운영(redis-cli) 섹션 추가

**Frontend (unesco)**
- Create: `unesco/components/GuestbookWidget.tsx` — 트리거 + panel + 폼
- Modify: `unesco/components/ChatWidget.tsx` — 내부 `open` state 제거, `open`/`onOpenChange` props로 lift
- Modify: `unesco/app/page.tsx` — `openWidget` state 추가, 두 widget 마운트

---

## Task 1: Upstash Redis 셋업 (사용자 수동 액션)

**Files:** 없음 (Vercel 대시보드 작업)

- [ ] **Step 1: Vercel Marketplace에서 Upstash Redis Integration 연결**

이 단계는 Claude가 자동으로 못 합니다. 사용자가 직접:
1. https://vercel.com/dashboard 접속 (`michaels-projects-10d334b5` 팀)
2. `hyecho-master` 프로젝트 → Storage 탭 → "Connect Database"
3. Upstash Redis (Marketplace) 선택 → "Free" 플랜 → region은 가까운 곳 (예: `iad1` US East)
4. 프로젝트 연결 시 자동으로 다음 env가 production/preview/development에 주입됨:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - 그 외 부속 변수들 (`UPSTASH_REDIS_URL` 등 — 사용 안 함)

- [ ] **Step 2: env 주입 검증**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
VERCEL_TOKEN=$(cat ~/.vercel-token) npx vercel env ls
```

Expected: `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`이 production/preview/development 3개 환경 모두에 등록됨.

- [ ] **Step 3: 로컬 .env에 같은 값 복사 (로컬 dev에서도 사용)**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
VERCEL_TOKEN=$(cat ~/.vercel-token) npx vercel env pull .env --environment=production --yes
```

Expected: `.env` 파일에 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, 기존 `GEMINI_API_KEY`가 같이 있음. (gitignore로 보호됨.)

---

## Task 2: Backend - guestbook 모듈 작성 (helpers + TDD)

**Files:**
- Create: `hyecho-master/api/guestbook.py`
- Create: `hyecho-master/tests/__init__.py`
- Create: `hyecho-master/tests/test_guestbook.py`

- [ ] **Step 1: 빈 tests 패키지 마커 생성**

Run:
```bash
touch /home/ubuntu/domain-expansion/hyecho-master/tests/__init__.py
```

- [ ] **Step 2: 실패 테스트 작성 (IP 추출, IP hash)**

Create `hyecho-master/tests/test_guestbook.py`:

```python
"""Guestbook module unit tests."""

import json
import pytest
from unittest.mock import AsyncMock
from starlette.requests import Request

from api import guestbook


def _make_request(headers=None, client_host="10.0.0.1"):
    """Build a minimal Starlette Request for testing."""
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (client_host, 12345),
    }
    return Request(scope)


class TestClientIp:
    def test_uses_x_forwarded_for_first_value(self):
        req = _make_request(headers={"x-forwarded-for": "203.0.113.5, 10.0.0.1"})
        assert guestbook._client_ip(req) == "203.0.113.5"

    def test_strips_whitespace_around_xff_first_value(self):
        req = _make_request(headers={"x-forwarded-for": "  203.0.113.5  , 10.0.0.1"})
        assert guestbook._client_ip(req) == "203.0.113.5"

    def test_falls_back_to_x_real_ip(self):
        req = _make_request(headers={"x-real-ip": "198.51.100.7"})
        assert guestbook._client_ip(req) == "198.51.100.7"

    def test_falls_back_to_request_client_host(self):
        req = _make_request(client_host="172.18.0.5")
        assert guestbook._client_ip(req) == "172.18.0.5"


class TestIpHash:
    def test_returns_16_hex_chars(self):
        h = guestbook._ip_hash("203.0.113.5")
        assert len(h) == 16
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic(self):
        assert guestbook._ip_hash("1.2.3.4") == guestbook._ip_hash("1.2.3.4")

    def test_different_for_different_ips(self):
        assert guestbook._ip_hash("1.2.3.4") != guestbook._ip_hash("1.2.3.5")
```

- [ ] **Step 3: 테스트 실행 → fail 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'api.guestbook'` (모듈 아직 없음)

- [ ] **Step 4: guestbook.py 헬퍼 구현**

Create `hyecho-master/api/guestbook.py`:

```python
"""Guestbook backend — Upstash Redis 기반 익명 방명록.

데이터:
  - LIST  gb:entries          최근 1000개 글 (JSON 직렬화)
  - STR   gb:rate:<ip_hash>   분당 1개 rate limit (TTL 60s)

이 파일은 helpers + GET/POST handler를 export 하고, index.py에서 라우팅한다.
"""

from __future__ import annotations

import hashlib
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
```

- [ ] **Step 5: 테스트 재실행 → pass 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py -v
```

Expected: PASS — `TestClientIp` 4개, `TestIpHash` 3개 모두 통과.

- [ ] **Step 6: Upstash REST helper 테스트 추가**

Append to `hyecho-master/tests/test_guestbook.py`:

```python
class TestUpstashCall:
    @pytest.mark.asyncio
    async def test_single_command_posts_to_command_endpoint(self, monkeypatch):
        captured = {}

        class FakeResponse:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return {"result": "OK"}

        class FakeClient:
            def __init__(self, **kw): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return None
            async def post(self, url, json=None, headers=None):
                captured["url"] = url
                captured["json"] = json
                captured["headers"] = headers
                return FakeResponse()

        monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io")
        monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "TESTTOKEN")
        monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

        result = await guestbook._upstash_call(["GET", "foo"])

        assert captured["url"] == "https://example.upstash.io"
        assert captured["json"] == ["GET", "foo"]
        assert captured["headers"]["Authorization"] == "Bearer TESTTOKEN"
        assert result == {"result": "OK"}

    @pytest.mark.asyncio
    async def test_pipeline_posts_to_pipeline_endpoint(self, monkeypatch):
        captured = {}

        class FakeResponse:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return [{"result": 1}, {"result": "OK"}]

        class FakeClient:
            def __init__(self, **kw): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return None
            async def post(self, url, json=None, headers=None):
                captured["url"] = url
                captured["json"] = json
                return FakeResponse()

        monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io")
        monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "TESTTOKEN")
        monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

        result = await guestbook._upstash_call(
            [["LPUSH", "k", "v"], ["LTRIM", "k", "0", "999"]],
            pipeline=True,
        )

        assert captured["url"] == "https://example.upstash.io/pipeline"
        assert captured["json"] == [["LPUSH", "k", "v"], ["LTRIM", "k", "0", "999"]]
        assert result == [{"result": 1}, {"result": "OK"}]
```

(Note: pytest-asyncio가 dep에 없으면 추가 필요)

- [ ] **Step 7: pytest-asyncio가 설치돼 있는지 확인 + 필요시 추가**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run python -c "import pytest_asyncio; print(pytest_asyncio.__version__)"
```

If `ModuleNotFoundError`:
```bash
# pyproject.toml의 [dependency-groups].dev에 pytest-asyncio 추가 (직접 편집)
# 그리고
uv sync
```

`hyecho-master/pyproject.toml`의 dev deps에 추가:
```toml
[dependency-groups]
dev = [
    "httpx>=0.28.1",
    "pytest>=9.0.2",
    "pytest-asyncio>=0.23.0",
]
```

또한 `hyecho-master/pyproject.toml`에 pytest config 추가 (asyncio mode):
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 8: 테스트 실행 → fail 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py -v
```

Expected: 새 두 테스트 FAIL — `AttributeError: module 'api.guestbook' has no attribute '_upstash_call'`.

- [ ] **Step 9: `_upstash_call` 구현**

Append to `hyecho-master/api/guestbook.py`:

```python
async def _upstash_call(commands, *, pipeline: bool = False):
    """Upstash REST API call.

    pipeline=False: commands = ["LPUSH", "key", "value"] → POST /
    pipeline=True : commands = [["LPUSH",..], ["LTRIM",..]] → POST /pipeline

    Returns the parsed JSON response.
    """
    base = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
    if not base or not token:
        raise RuntimeError("UPSTASH_REDIS_REST_URL / TOKEN env not set")
    url = f"{base}/pipeline" if pipeline else base
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.post(url, json=commands, headers=headers)
        resp.raise_for_status()
        return resp.json()
```

- [ ] **Step 10: 테스트 재실행 → pass 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py -v
```

Expected: 모든 테스트 PASS (IP 추출 4개 + IP hash 3개 + Upstash call 2개 = 9개).

- [ ] **Step 11: 커밋**

Run:
```bash
cd /home/ubuntu/domain-expansion
git add hyecho-master/api/guestbook.py hyecho-master/tests/__init__.py hyecho-master/tests/test_guestbook.py hyecho-master/pyproject.toml hyecho-master/uv.lock
git commit -m "feat(guestbook): IP 추출/해싱 + Upstash REST helper + 단위 테스트"
```

---

## Task 3: Backend - GET /api/guestbook endpoint

**Files:**
- Modify: `hyecho-master/api/guestbook.py` (append `fetch_entries` + Starlette handler)
- Modify: `hyecho-master/tests/test_guestbook.py` (append handler test)
- Modify: `hyecho-master/api/index.py` (route 등록)

- [ ] **Step 1: 실패 테스트 작성 (GET)**

Append to `hyecho-master/tests/test_guestbook.py`:

```python
class TestFetchEntries:
    @pytest.mark.asyncio
    async def test_returns_parsed_entries_in_lrange_order(self, monkeypatch):
        async def fake_upstash(commands, pipeline=False):
            assert commands == ["LRANGE", ENTRIES_KEY, "0", "49"]
            return {"result": [
                json.dumps({"message": "최신", "ts": 1716}),
                json.dumps({"message": "구식", "ts": 1715}),
            ]}
        monkeypatch.setattr(guestbook, "_upstash_call", fake_upstash)
        entries = await guestbook.fetch_entries(limit=50)
        assert entries == [
            {"message": "최신", "ts": 1716},
            {"message": "구식", "ts": 1715},
        ]

    @pytest.mark.asyncio
    async def test_skips_corrupted_entries(self, monkeypatch):
        async def fake_upstash(commands, pipeline=False):
            return {"result": [
                json.dumps({"message": "정상", "ts": 1}),
                "not-json-{",
                json.dumps({"message": "정상2", "ts": 2}),
            ]}
        monkeypatch.setattr(guestbook, "_upstash_call", fake_upstash)
        entries = await guestbook.fetch_entries(limit=50)
        assert entries == [{"message": "정상", "ts": 1}, {"message": "정상2", "ts": 2}]

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_entries(self, monkeypatch):
        async def fake_upstash(commands, pipeline=False):
            return {"result": []}
        monkeypatch.setattr(guestbook, "_upstash_call", fake_upstash)
        entries = await guestbook.fetch_entries(limit=50)
        assert entries == []
```

Add import at top:
```python
from api.guestbook import ENTRIES_KEY
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py::TestFetchEntries -v
```

Expected: FAIL — `AttributeError: module 'api.guestbook' has no attribute 'fetch_entries'`.

- [ ] **Step 3: `fetch_entries` + Starlette handler 구현**

Append to `hyecho-master/api/guestbook.py`:

```python
from starlette.responses import JSONResponse


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
    except Exception as exc:
        logger.exception("GET /api/guestbook failed")
        return JSONResponse({"error": "fetch failed"}, status_code=500)
```

- [ ] **Step 4: 테스트 재실행 → pass 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py -v
```

Expected: 모든 테스트 PASS (이전 9개 + GET 3개 = 12개).

- [ ] **Step 5: index.py에 GET route 등록**

Modify `hyecho-master/api/index.py` — `Route` imports와 라우팅 부분 찾아 추가:

```python
# 기존 import 근처에 추가
from api.guestbook import get_handler as guestbook_get_handler, post_handler as guestbook_post_handler

# Starlette routes 부분에 추가 (Mount("/", a2a_app) 보다 위)
Route("/api/guestbook", guestbook_get_handler, methods=["GET"]),
Route("/api/guestbook", guestbook_post_handler, methods=["POST", "OPTIONS"]),
```

(POST handler는 Task 4에서 구현. 지금 import만 미리 추가하면 ImportError. → Step 6에서 post_handler 빈 stub 만들고 본격 구현은 Task 4.)

- [ ] **Step 6: post_handler stub (Task 4에서 본 구현)**

Append to `hyecho-master/api/guestbook.py`:

```python
async def post_handler(request: Request) -> JSONResponse:
    """POST /api/guestbook — Task 4에서 구현."""
    return JSONResponse({"error": "not implemented"}, status_code=501)
```

- [ ] **Step 7: 로컬에서 GET endpoint 동작 검증**

Run (terminal 1, in `hyecho-master/`):
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run uvicorn api.index:app --host 0.0.0.0 --port 9999
```

Run (terminal 2):
```bash
curl -s http://localhost:9999/api/guestbook
```

Expected: `[]` (빈 list, Upstash에 데이터 없음).

(만약 `UPSTASH_REDIS_REST_URL` env가 없으면 500 + log "UPSTASH_REDIS_REST_URL / TOKEN env not set" — Task 1을 완료했는지 확인.)

- [ ] **Step 8: 커밋**

Run:
```bash
cd /home/ubuntu/domain-expansion
git add hyecho-master/api/guestbook.py hyecho-master/api/index.py hyecho-master/tests/test_guestbook.py
git commit -m "feat(guestbook): GET /api/guestbook + fetch_entries + route 등록 (POST stub)"
```

---

## Task 4: Backend - POST /api/guestbook endpoint

**Files:**
- Modify: `hyecho-master/api/guestbook.py` (post_handler 본 구현)
- Modify: `hyecho-master/tests/test_guestbook.py` (POST 테스트)

- [ ] **Step 1: 실패 테스트 작성 (POST)**

Append to `hyecho-master/tests/test_guestbook.py`:

```python
class TestPostHandler:
    @pytest.fixture
    def fake_upstash(self, monkeypatch):
        """Stateful in-memory fake. Records all commands."""
        state = {"calls": [], "rate": {}, "entries": []}

        async def fake(commands, pipeline=False):
            state["calls"].append({"commands": commands, "pipeline": pipeline})
            if pipeline:
                # commands is list[list]
                results = []
                for cmd in commands:
                    op = cmd[0]
                    if op == "SET":
                        key = cmd[1]
                        if "NX" in cmd and key in state["rate"]:
                            results.append({"result": None})  # NX failed
                        else:
                            state["rate"][key] = cmd[2]
                            results.append({"result": "OK"})
                    elif op == "INCR":
                        key = cmd[1]
                        state["rate"][key] = int(state["rate"].get(key, 0)) + 1
                        results.append({"result": state["rate"][key]})
                    elif op == "LPUSH":
                        state["entries"].insert(0, cmd[2])
                        results.append({"result": len(state["entries"])})
                    elif op == "LTRIM":
                        state["entries"] = state["entries"][:int(cmd[3]) + 1]
                        results.append({"result": "OK"})
                    else:
                        results.append({"result": None})
                return results
            else:
                op = commands[0]
                if op == "INCR":
                    key = commands[1]
                    state["rate"][key] = int(state["rate"].get(key, 0)) + 1
                    return {"result": state["rate"][key]}
                if op == "LRANGE":
                    return {"result": list(state["entries"])}
                return {"result": None}

        monkeypatch.setattr(guestbook, "_upstash_call", fake)
        return state

    @pytest.mark.asyncio
    async def test_accepts_valid_message(self, fake_upstash):
        req = _make_request(
            headers={"x-forwarded-for": "1.2.3.4", "content-type": "application/json"},
        )
        # Inject body
        body = json.dumps({"message": "안녕"}).encode()
        async def receive(): return {"type": "http.request", "body": body}
        req._receive = receive

        resp = await guestbook.post_handler(req)
        assert resp.status_code == 201
        # entry stored
        assert len(fake_upstash["entries"]) == 1
        entry = json.loads(fake_upstash["entries"][0])
        assert entry["message"] == "안녕"
        assert isinstance(entry["ts"], int)

    @pytest.mark.asyncio
    async def test_rejects_empty_message(self, fake_upstash):
        body = json.dumps({"message": "   "}).encode()
        req = _make_request(headers={"x-forwarded-for": "1.2.3.4"})
        async def receive(): return {"type": "http.request", "body": body}
        req._receive = receive

        resp = await guestbook.post_handler(req)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_too_long_message(self, fake_upstash):
        body = json.dumps({"message": "x" * 281}).encode()
        req = _make_request(headers={"x-forwarded-for": "1.2.3.4"})
        async def receive(): return {"type": "http.request", "body": body}
        req._receive = receive

        resp = await guestbook.post_handler(req)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_rate_limits_second_request_within_60s(self, fake_upstash):
        req1 = _make_request(headers={"x-forwarded-for": "1.2.3.4"})
        body = json.dumps({"message": "first"}).encode()
        async def receive1(): return {"type": "http.request", "body": body}
        req1._receive = receive1

        resp1 = await guestbook.post_handler(req1)
        assert resp1.status_code == 201

        req2 = _make_request(headers={"x-forwarded-for": "1.2.3.4"})
        body2 = json.dumps({"message": "second"}).encode()
        async def receive2(): return {"type": "http.request", "body": body2}
        req2._receive = receive2

        resp2 = await guestbook.post_handler(req2)
        assert resp2.status_code == 429
        # entry should not be added
        assert len(fake_upstash["entries"]) == 1

    @pytest.mark.asyncio
    async def test_different_ips_are_independent(self, fake_upstash):
        body = json.dumps({"message": "hi"}).encode()

        req1 = _make_request(headers={"x-forwarded-for": "1.2.3.4"})
        async def r1(): return {"type": "http.request", "body": body}
        req1._receive = r1
        resp1 = await guestbook.post_handler(req1)

        req2 = _make_request(headers={"x-forwarded-for": "5.6.7.8"})
        async def r2(): return {"type": "http.request", "body": body}
        req2._receive = r2
        resp2 = await guestbook.post_handler(req2)

        assert resp1.status_code == 201
        assert resp2.status_code == 201
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py::TestPostHandler -v
```

Expected: 모든 테스트 FAIL — handler가 stub 501 응답.

- [ ] **Step 3: post_handler 본 구현**

Replace stub in `hyecho-master/api/guestbook.py`:

```python
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
        return JSONResponse({"error": "message length 1..280"}, status_code=400)

    # 2. rate limit (atomic pipeline: SET NX EX 60 + INCR)
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
```

- [ ] **Step 4: 테스트 재실행 → pass 확인**

Run:
```bash
cd /home/ubuntu/domain-expansion/hyecho-master
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/test_guestbook.py -v
```

Expected: 모든 테스트 PASS (총 ~17개: IP 4 + hash 3 + upstash 2 + fetch 3 + post 5).

- [ ] **Step 5: 로컬에서 POST endpoint 동작 검증**

Run (이미 dev server 떠 있어야):
```bash
curl -s -X POST http://localhost:9999/api/guestbook \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.0.2.1" \
  -d '{"message":"테스트 메시지"}'
```

Expected: `{"message": "테스트 메시지", "ts": 1716...}` + status 201.

Run 즉시 한번 더:
```bash
curl -s -X POST http://localhost:9999/api/guestbook \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.0.2.1" \
  -d '{"message":"두 번째"}'
```

Expected: `{"error":"rate limited"}` + status 429 (분당 1개 cap 작동).

Run GET으로 확인:
```bash
curl -s http://localhost:9999/api/guestbook
```

Expected: `[{"message":"테스트 메시지","ts":...}]`.

- [ ] **Step 6: 커밋**

Run:
```bash
cd /home/ubuntu/domain-expansion
git add hyecho-master/api/guestbook.py hyecho-master/tests/test_guestbook.py
git commit -m "feat(guestbook): POST /api/guestbook + rate limit + 5개 단위 테스트"
```

---

## Task 5: Backend - README 운영 섹션

**Files:**
- Modify: `hyecho-master/README.md`

- [ ] **Step 1: 운영 섹션 추가**

`hyecho-master/README.md` 끝에 추가:

```markdown
## 방명록 운영

### Upstash Redis 셋업 (1회)
1. https://vercel.com/dashboard → `hyecho-master` 프로젝트 → Storage 탭
2. "Connect Database" → Upstash Redis (Marketplace) → Free 플랜
3. `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 자동 주입 확인
4. 로컬 dev: `vercel env pull .env --environment=production`

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
```

- [ ] **Step 2: 커밋**

Run:
```bash
cd /home/ubuntu/domain-expansion
git add hyecho-master/README.md
git commit -m "docs(hyecho-master): 방명록 운영 섹션 (Upstash 셋업 + 삭제 명령)"
```

---

## Task 6: hyecho-master production 배포 + smoke test

**Files:** 없음 (배포 작업)

- [ ] **Step 1: push + production deploy**

Run:
```bash
cd /home/ubuntu/domain-expansion
git push 2>&1 | tail -2

cd hyecho-master
VERCEL_TOKEN=$(cat ~/.vercel-token) npx vercel --prod --yes 2>&1 | grep -E "Production|Aliased"
```

Expected: `Production` URL + `Aliased https://hyecho-master.vercel.app`.

- [ ] **Step 2: production smoke test**

Run:
```bash
# GET (빈 또는 기존 데이터)
curl -s https://hyecho-master.vercel.app/api/guestbook | head -c 200

# POST 새 글
curl -s -X POST https://hyecho-master.vercel.app/api/guestbook \
  -H "Content-Type: application/json" \
  -d '{"message":"production 검증 메시지"}' | head -c 200

# GET 다시 (방금 작성 포함)
curl -s https://hyecho-master.vercel.app/api/guestbook | head -c 300
```

Expected:
1. 첫 GET: `[]` 또는 기존 글 list
2. POST: `201 {"message":"production 검증 메시지","ts":...}`
3. 두번째 GET: 방금 글이 list 맨 위에

(만약 500/timeout — Upstash env 주입 확인 또는 cold start. 5초 후 재시도.)

---

## Task 7: Frontend - GuestbookWidget 컴포넌트

**Files:**
- Create: `unesco/components/GuestbookWidget.tsx`

- [ ] **Step 1: GuestbookWidget.tsx 작성**

Create `unesco/components/GuestbookWidget.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";

interface Entry {
  message: string;
  ts: number;
}

interface GuestbookWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_HYECHO_API || "http://localhost:9999";
const MAX_LEN = 280;

function formatTs(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function GuestbookWidget({ open, onOpenChange }: GuestbookWidgetProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [postErrorMsg, setPostErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 첫 로드: GET
  const loadEntries = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`${API_BASE}/api/guestbook`);
      if (!res.ok) throw new Error(String(res.status));
      const data: Entry[] = await res.json();
      setEntries(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadEntries(); }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async () => {
    const message = input.trim();
    if (!message || sending) return;
    if (message.length > MAX_LEN) {
      setPostErrorMsg("한 줄로, 280자 이내로 남겨주시게");
      return;
    }
    setSending(true);
    setPostErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/guestbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.status === 201) {
        const entry: Entry = await res.json();
        setEntries((prev) => [entry, ...prev]);
        setInput("");
      } else if (res.status === 429) {
        setPostErrorMsg("잠시 후 다시 와주시게");
      } else if (res.status === 400) {
        setPostErrorMsg("한 줄로, 280자 이내로 남겨주시게");
      } else {
        setPostErrorMsg("지금은 기록을 새길 수 없네…");
      }
    } catch {
      setPostErrorMsg("지금은 기록을 새길 수 없네…");
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      {/* 트리거 (닫힌 상태) */}
      {!open && (
        <>
          {/* 모바일: 혜초대사 책갈피 아래 */}
          <div
            className="md:hidden absolute z-10"
            style={{
              top: "298px",
              right: "12px",
              padding: "2px",
              borderRadius: "4px",
              background: "linear-gradient(180deg, rgba(20,19,28,0.95), rgba(20,19,28,0.7))",
              boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
            }}
          >
            <button
              onClick={() => onOpenChange(true)}
              className="flex flex-col items-center justify-center gap-0.5"
              style={{
                width: "80px",
                height: "80px",
                background: "var(--paper-100)",
                borderRadius: "3px",
              }}
              aria-label="방명록 열기"
            >
              <span className="serif-kr" style={{ fontSize: "28px", lineHeight: 1, color: "var(--ink-deep)", fontWeight: 700 }}>言</span>
              <span className="text-[10px] mt-1 tracking-[0.25em]" style={{ color: "var(--ink-deep)" }}>방명록</span>
            </button>
          </div>

          {/* 데스크탑: 혜초대사 트리거 우측 */}
          <button
            onClick={() => onOpenChange(true)}
            className="hidden md:flex absolute bottom-5 z-10 items-center gap-3 px-6 py-3.5 transition-all hover:translate-x-1"
            style={{
              left: "268px",
              background: "var(--paper-100)",
              color: "var(--ink-deep)",
              borderRadius: "3px",
              boxShadow: "0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(20,19,28,0.08)",
              borderLeft: "4px solid var(--vermillion)",
            }}
            aria-label="방명록 열기"
          >
            <span className="serif-kr font-bold" style={{ fontSize: "26px", lineHeight: 1 }}>言</span>
            <span className="flex flex-col items-start leading-tight">
              <span className="display-italic text-[11px] tracking-[0.2em] uppercase" style={{ color: "var(--paper-700)" }}>Leave a Trace</span>
              <span className="serif-kr text-base font-semibold">방명록</span>
            </span>
          </button>
        </>
      )}

      {/* Panel (열린 상태) */}
      {open && (
        <>
          {/* 데스크탑: 우하단 */}
          <div
            className="hidden md:flex absolute bottom-3 right-3 z-20 flex-col rounded-md shadow-2xl scroll-edge paper-grain"
            style={{
              width: "380px",
              height: "min(540px, calc(100dvh - 80px))",
              background: "rgba(31,29,42,0.97)",
              backdropFilter: "blur(12px)",
              borderLeft: "3px solid var(--vermillion)",
            }}
          >
            <Panel {...{ entries, input, setInput, submit, sending, loading, loadError, postErrorMsg, handleKey, onClose: () => onOpenChange(false), inputRef, retry: loadEntries }} />
          </div>

          {/* 모바일: 하단 시트 */}
          <div
            className="md:hidden absolute z-30 flex flex-col shadow-2xl paper-grain"
            style={{
              left: 0,
              right: 0,
              bottom: 0,
              height: "55dvh",
              maxHeight: "calc(100dvh - 160px)",
              background: "rgba(31,29,42,0.97)",
              backdropFilter: "blur(12px)",
              borderTop: "3px solid var(--vermillion)",
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
            }}
          >
            <Panel {...{ entries, input, setInput, submit, sending, loading, loadError, postErrorMsg, handleKey, onClose: () => onOpenChange(false), inputRef, retry: loadEntries }} />
          </div>
        </>
      )}
    </>
  );
}

interface PanelProps {
  entries: Entry[];
  input: string;
  setInput: (s: string) => void;
  submit: () => void;
  sending: boolean;
  loading: boolean;
  loadError: boolean;
  postErrorMsg: string | null;
  handleKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  retry: () => void;
}

function Panel({ entries, input, setInput, submit, sending, loading, loadError, postErrorMsg, handleKey, onClose, inputRef, retry }: PanelProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b shrink-0" style={{ borderColor: "var(--ink-border)" }}>
        <div className="flex items-center gap-3">
          <span className="serif-kr" style={{ fontSize: "24px", lineHeight: 1, color: "var(--vermillion)", fontWeight: 700 }}>言</span>
          <div className="leading-tight">
            <p className="serif-kr text-base font-semibold" style={{ color: "var(--paper-100)" }}>방명록</p>
            <p className="display-italic text-[11px] tracking-wider" style={{ color: "var(--paper-500)" }}>길벗들의 발자취</p>
          </div>
        </div>
        <button onClick={onClose} className="text-xl leading-none px-2" style={{ color: "var(--paper-500)" }} aria-label="닫기">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && (
          <p className="display-italic text-center mt-6" style={{ color: "var(--paper-500)" }}>
            발자취를 읽어오는 중…
          </p>
        )}
        {!loading && loadError && (
          <div className="text-center mt-6">
            <p className="serif-kr" style={{ color: "var(--paper-100)" }}>발자취를 읽어올 수 없네…</p>
            <button onClick={retry} className="display-italic text-xs mt-3 underline" style={{ color: "var(--vermillion)" }}>다시 시도</button>
          </div>
        )}
        {!loading && !loadError && entries.length === 0 && (
          <p className="display-italic text-center mt-6 leading-relaxed" style={{ color: "var(--paper-500)" }}>
            아직 발자취가 없네.<br />첫 글을 남겨보게.
          </p>
        )}
        {!loading && !loadError && entries.map((e) => (
          <div
            key={e.ts}
            className="px-3 py-2 serif-kr leading-relaxed text-sm whitespace-pre-wrap"
            style={{
              background: "rgba(244,236,216,0.04)",
              color: "var(--paper-100)",
              borderLeft: "2px solid rgba(244,236,216,0.18)",
              borderRadius: "2px",
            }}
          >
            <p>{e.message}</p>
            <p className="display-italic text-[11px] mt-1.5 tracking-wider tabular-nums" style={{ color: "var(--vermillion)" }}>
              {formatTs(e.ts)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-3 shrink-0" style={{ borderColor: "var(--ink-border)" }}>
        {postErrorMsg && (
          <p className="serif-kr text-xs mb-2" style={{ color: "var(--vermillion)" }}>{postErrorMsg}</p>
        )}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(244,236,216,0.05)", borderRadius: "2px", border: "1px solid rgba(244,236,216,0.1)" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="한 줄 남기기…"
            disabled={sending}
            maxLength={MAX_LEN}
            className="flex-1 bg-transparent outline-none serif-kr disabled:opacity-50"
            style={{ fontSize: "16px", color: "var(--paper-100)" }}
          />
          <button
            onClick={submit}
            disabled={sending || !input.trim()}
            className="serif-kr text-sm tracking-wider disabled:opacity-30 px-2"
            style={{ color: "var(--vermillion)" }}
            aria-label="새김"
          >
            새김
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 커밋**

Run:
```bash
cd /home/ubuntu/domain-expansion
git add unesco/components/GuestbookWidget.tsx
git commit -m "feat(unesco): GuestbookWidget 컴포넌트 신설 (트리거 + panel + GET/POST)"
```

---

## Task 8: ChatWidget을 open prop으로 lift

**Files:**
- Modify: `unesco/components/ChatWidget.tsx`

- [ ] **Step 1: ChatWidget의 시그니처 + 내부 state 변경**

Modify `unesco/components/ChatWidget.tsx`:

Find:
```tsx
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
```

Replace with:
```tsx
interface ChatWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChatWidget({ open, onOpenChange }: ChatWidgetProps) {
```

Then find every call to `setOpen(true)` and replace with `onOpenChange(true)`, and `setOpen(false)` with `onOpenChange(false)`. (보통 트리거 onClick + close button onClick = 3-4곳.)

Use grep + edit:
```bash
grep -n "setOpen" /home/ubuntu/domain-expansion/unesco/components/ChatWidget.tsx
```

각 라인을 Edit으로 교체.

- [ ] **Step 2: 빌드 검증**

Run:
```bash
cd /home/ubuntu/domain-expansion/unesco
npm run build 2>&1 | tail -15
```

Expected: `Compiled successfully` + TypeScript pass. (단, `app/page.tsx`가 ChatWidget을 props 없이 마운트하면 type error. Task 9에서 page.tsx 수정하면 해결.)

만약 build error가 page.tsx의 ChatWidget 사용 부분 때문이면 Task 9으로 넘어가서 같이 작업.

- [ ] **Step 3: 커밋 (Task 9과 함께)**

Build error가 남아 있을 경우 commit은 Task 9 끝나고 한 번에. 일단 next step으로.

---

## Task 9: app/page.tsx에 openWidget state + 두 widget 마운트

**Files:**
- Modify: `unesco/app/page.tsx`

- [ ] **Step 1: import + state 추가**

Modify `unesco/app/page.tsx`:

Find:
```tsx
import ChatWidget from "@/components/ChatWidget";
```

Append:
```tsx
import GuestbookWidget from "@/components/GuestbookWidget";
```

Find:
```tsx
  // 선택 상태
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
```

Above this line add:
```tsx
  // 상호 배타: 동시에 하나만 열림
  const [openWidget, setOpenWidget] = useState<"chat" | "guestbook" | null>(null);
```

- [ ] **Step 2: 마운트 변경**

Find:
```tsx
      <ChatWidget />
    </div>
```

Replace with:
```tsx
      <ChatWidget
        open={openWidget === "chat"}
        onOpenChange={(o) => setOpenWidget(o ? "chat" : null)}
      />
      <GuestbookWidget
        open={openWidget === "guestbook"}
        onOpenChange={(o) => setOpenWidget(o ? "guestbook" : null)}
      />
    </div>
```

- [ ] **Step 3: 빌드 검증**

Run:
```bash
cd /home/ubuntu/domain-expansion/unesco
npm run build 2>&1 | tail -10
```

Expected: `Compiled successfully` + TypeScript pass.

- [ ] **Step 4: dev server에서 시각 검증**

Run (terminal 1):
```bash
cd /home/ubuntu/domain-expansion/unesco
setsid bash -c "nohup npm run dev > /tmp/nextdev.log 2>&1 &" < /dev/null
sleep 5
```

Open browser at `http://localhost:3000` (또는 Playwright로 evaluate):
- 데스크탑(1440): 좌하단 혜초대사 트리거 + 그 우측에 "방명록" 트리거. 둘 다 paper card.
- 모바일(390): 우상단 트로피 + 혜초대사(아래) + 방명록(맨 아래) 책갈피 3개 연속.
- 혜초대사 열고 방명록 클릭 → 혜초대사 닫히고 방명록 열림 (상호 배타).
- 방명록에서 글 작성 → list에 즉시 표시.

- [ ] **Step 5: Task 8 + 9 커밋**

Run:
```bash
cd /home/ubuntu/domain-expansion
git add unesco/components/ChatWidget.tsx unesco/app/page.tsx
git commit -m "feat(unesco): ChatWidget open prop lift + page.tsx에 openWidget 상호 배타 + GuestbookWidget 마운트"
```

---

## Task 10: unesco production 배포 + 최종 검증

**Files:** 없음 (배포 작업)

- [ ] **Step 1: push + production deploy**

Run:
```bash
cd /home/ubuntu/domain-expansion
git push 2>&1 | tail -2

cd unesco
VERCEL_TOKEN=$(cat ~/.vercel-token) npx vercel --prod --yes 2>&1 | grep -E "Production|Aliased"
```

Expected: production URL + alias `unesco-delta.vercel.app`.

- [ ] **Step 2: production end-to-end 검증**

Playwright로 `https://unesco-delta.vercel.app` 접속:
- 좌하단 혜초대사 트리거 보임, 그 우측에 "방명록" 트리거 보임 ✓
- 모바일 viewport(390): 트로피(top 112) → 혜초대사(top 206) → 방명록(top 300) 책갈피 stack ✓
- 데스크탑에서 방명록 클릭 → 우하단에 panel 열림, "발자취를 읽어오는 중…" → 1-2초 후 list 표시 ✓
- 새 글 작성 → 즉시 list 맨 위에 prepend, 안전한 timestamp 표시 ✓
- 1분 안에 두번째 글 시도 → "잠시 후 다시 와주시게" 인라인 메시지 ✓
- 혜초대사 열고 방명록 클릭 → 혜초대사 닫히고 방명록 열림 ✓
- 콘솔 errors 없음 ✓

- [ ] **Step 3: 운영 모니터링 확인**

Upstash 대시보드 (`vercel.com/dashboard` → hyecho-master → Storage → Upstash) 접속:
- `gb:entries` 키에 LIST 존재 + 최근 글 보임
- commands/day < 10K (무료 한도)

---

## Self-Review (작성 후 점검)

**Spec coverage 점검**:

| Spec 섹션 | Plan task |
|---|---|
| 1. 목표 | Task 7,9 (UI 위치) + Task 6,10 (배포) |
| 2. 결정 사항 | Task 1 (인프라) + Task 4 (rate limit) |
| 3. 아키텍처 | Task 2-4 (backend) + Task 7-9 (frontend) |
| 4. 데이터 모델 | Task 3 fetch_entries + Task 4 entry JSON |
| 5. API GET | Task 3 |
| 5. API POST | Task 4 |
| 5. CORS | 기존 — Task에서 다루지 않음 (이미 작동) |
| 5. Upstash 호출 | Task 2 _upstash_call |
| 6. Frontend props/state | Task 7 GuestbookWidget |
| 6. 트리거 위치 | Task 7 |
| 6. Panel + 상호 배타 | Task 7 panel + Task 8 ChatWidget lift + Task 9 page.tsx |
| 6. 입력 single-line | Task 7 `<input type="text">` |
| 7. 에러 처리 | Task 7 Panel error states + Task 3,4 status codes |
| 8. 운영 | Task 5 README |
| 9. 환경변수 | Task 1 |
| 10. 테스트 시나리오 | Task 4 단위 테스트 + Task 10 e2e |
| 11. 비기능 | Task 1, Task 10 모니터링 |

✓ 모든 spec 요구사항이 task에 매핑됨.

**Placeholder 점검**: 모든 코드 블록에 실제 코드 포함됨. "TBD"/"TODO" 없음.

**타입 일관성**: `Entry { message: string, ts: number }` — frontend와 backend 모두 동일.
함수 시그니처: `fetch_entries(limit)`, `post_handler(request)`, `_client_ip(request)`, `_ip_hash(ip)`, `_upstash_call(commands, pipeline=False)` — 일관.

**완료**.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-guestbook.md`. Two execution options:

1. **Subagent-Driven (recommended)** — 매 task마다 fresh subagent 디스패치, task 사이에 리뷰, 빠른 iteration
2. **Inline Execution** — 이 세션에서 executing-plans로 batch 실행, 중간 checkpoint
