"""Guestbook module unit tests."""

import json
import pytest
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
