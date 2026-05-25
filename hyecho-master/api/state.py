"""Shared in-memory state. A2A endpoint용으로만 사용. 위젯(/api/chat)은 클라이언트 히스토리 방식으로 stateless."""

from google import genai
from google.genai import types as genai_types

_gemini_client: genai.Client | None = None
chat_histories: dict[str, list[genai_types.Content]] = {}


def get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client()
    return _gemini_client


class _LazyClient:
    """Proxy delaying genai.Client() init until first use (avoids import-time errors when GEMINI_API_KEY is unset)."""

    def __getattr__(self, name):
        return getattr(get_gemini_client(), name)


gemini_client = _LazyClient()
