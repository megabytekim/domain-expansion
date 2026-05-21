"""Guestbook module unit tests."""

import json
import pytest
from starlette.requests import Request

from api import guestbook
from api.guestbook import ENTRIES_KEY


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

        monkeypatch.setenv("KV_REST_API_URL", "https://example.upstash.io")
        monkeypatch.setenv("KV_REST_API_TOKEN", "TESTTOKEN")
        monkeypatch.setattr(guestbook.httpx, "AsyncClient", FakeClient)

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

        monkeypatch.setenv("KV_REST_API_URL", "https://example.upstash.io")
        monkeypatch.setenv("KV_REST_API_TOKEN", "TESTTOKEN")
        monkeypatch.setattr(guestbook.httpx, "AsyncClient", FakeClient)

        result = await guestbook._upstash_call(
            [["LPUSH", "k", "v"], ["LTRIM", "k", "0", "999"]],
            pipeline=True,
        )

        assert captured["url"] == "https://example.upstash.io/pipeline"
        assert captured["json"] == [["LPUSH", "k", "v"], ["LTRIM", "k", "0", "999"]]
        assert result == [{"result": 1}, {"result": "OK"}]

    @pytest.mark.asyncio
    async def test_raises_when_env_not_set(self, monkeypatch):
        monkeypatch.delenv("KV_REST_API_URL", raising=False)
        monkeypatch.delenv("KV_REST_API_TOKEN", raising=False)
        with pytest.raises(RuntimeError, match="KV_REST_API_URL"):
            await guestbook._upstash_call(["GET", "foo"])


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


class TestGetHandler:
    """Tests for the GET /api/guestbook handler — covers param parsing and error path."""

    @pytest.mark.asyncio
    async def test_invalid_limit_falls_back_to_default(self, monkeypatch):
        captured = {}

        async def fake_upstash(commands, pipeline=False):
            captured["commands"] = commands
            return {"result": []}

        monkeypatch.setattr(guestbook, "_upstash_call", fake_upstash)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [],
            "query_string": b"limit=not-a-number",
        }
        request = Request(scope)
        response = await guestbook.get_handler(request)

        assert response.status_code == 200
        # fetch_entries was called with DEFAULT_LIMIT (50), so LRANGE uses "0..49"
        assert captured["commands"] == ["LRANGE", ENTRIES_KEY, "0", str(guestbook.DEFAULT_LIMIT - 1)]

    @pytest.mark.asyncio
    async def test_returns_500_when_fetch_raises(self, monkeypatch):
        async def fake_upstash(commands, pipeline=False):
            raise RuntimeError("upstash down")

        monkeypatch.setattr(guestbook, "_upstash_call", fake_upstash)

        scope = {
            "type": "http",
            "method": "GET",
            "headers": [],
            "query_string": b"",
        }
        request = Request(scope)
        response = await guestbook.get_handler(request)

        assert response.status_code == 500


class TestPostHandler:
    """In-memory fake Upstash + Starlette Request body injection."""

    @pytest.fixture
    def fake_upstash(self, monkeypatch):
        """Stateful in-memory fake that simulates SET NX EX, INCR, LPUSH, LTRIM."""
        state = {"calls": [], "rate": {}, "entries": []}

        async def fake(commands, pipeline=False):
            state["calls"].append({"commands": commands, "pipeline": pipeline})
            if pipeline:
                results = []
                for cmd in commands:
                    op = cmd[0]
                    if op == "SET":
                        key = cmd[1]
                        # detect NX
                        if "NX" in cmd and key in state["rate"]:
                            results.append({"result": None})
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
                        state["entries"] = state["entries"][: int(cmd[3]) + 1]
                        results.append({"result": "OK"})
                    else:
                        results.append({"result": None})
                return results
            else:
                op = commands[0]
                if op == "LRANGE":
                    return {"result": list(state["entries"])}
                return {"result": None}

        monkeypatch.setattr(guestbook, "_upstash_call", fake)
        return state

    def _post_request(self, body_dict: dict, ip: str = "1.2.3.4"):
        """Build a Starlette Request with JSON body and X-Forwarded-For."""
        body = json.dumps(body_dict).encode()
        scope = {
            "type": "http",
            "method": "POST",
            "headers": [
                (b"x-forwarded-for", ip.encode()),
                (b"content-type", b"application/json"),
            ],
            "query_string": b"",
        }
        req = Request(scope)
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        req._receive = receive
        return req

    @pytest.mark.asyncio
    async def test_accepts_valid_message(self, fake_upstash):
        req = self._post_request({"message": "안녕"})
        resp = await guestbook.post_handler(req)
        assert resp.status_code == 201
        assert len(fake_upstash["entries"]) == 1
        entry = json.loads(fake_upstash["entries"][0])
        assert entry["message"] == "안녕"
        assert isinstance(entry["ts"], int)

    @pytest.mark.asyncio
    async def test_rejects_empty_message(self, fake_upstash):
        req = self._post_request({"message": "   "})
        resp = await guestbook.post_handler(req)
        assert resp.status_code == 400
        assert len(fake_upstash["entries"]) == 0

    @pytest.mark.asyncio
    async def test_rejects_too_long_message(self, fake_upstash):
        req = self._post_request({"message": "x" * 281})
        resp = await guestbook.post_handler(req)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_rate_limits_second_request_within_60s(self, fake_upstash):
        req1 = self._post_request({"message": "first"})
        resp1 = await guestbook.post_handler(req1)
        assert resp1.status_code == 201

        req2 = self._post_request({"message": "second"})
        resp2 = await guestbook.post_handler(req2)
        assert resp2.status_code == 429
        # 두 번째는 entry 추가 안 됨
        assert len(fake_upstash["entries"]) == 1

    @pytest.mark.asyncio
    async def test_different_ips_are_independent(self, fake_upstash):
        req1 = self._post_request({"message": "hi"}, ip="1.2.3.4")
        resp1 = await guestbook.post_handler(req1)

        req2 = self._post_request({"message": "hi"}, ip="5.6.7.8")
        resp2 = await guestbook.post_handler(req2)

        assert resp1.status_code == 201
        assert resp2.status_code == 201
