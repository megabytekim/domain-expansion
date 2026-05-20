"""Shared in-memory state. v1: ephemeral (휘발). v2 후보: Vercel KV/Upstash."""

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
