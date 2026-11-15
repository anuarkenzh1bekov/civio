"""Google Gemini over its REST API (no SDK dependency). Used when
GOOGLE_API_KEY is set; the model can be changed with GEMINI_MODEL.
The key is sent in a header and never appears in a URL or a log line."""

import os
from typing import Any, Literal

import httpx

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_BLOCKED = {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}


class GeminiError(Exception):
    """Why a call produced no usable text. `status` is the HTTP status, when there was one."""

    def __init__(self, kind: Literal["auth", "rate_limit", "blocked", "api"], status: int | None = None):
        super().__init__(f"Gemini {kind}{f' ({status})' if status else ''}")
        self.kind = kind
        self.status = status


def _text_of(chunk: dict[str, Any]) -> str:
    """Visible text of a reply. Raises when the model or its filters declined."""
    if (chunk.get("promptFeedback") or {}).get("blockReason"):
        raise GeminiError("blocked")
    candidate = (chunk.get("candidates") or [{}])[0]
    if candidate.get("finishReason") in _BLOCKED:
        raise GeminiError("blocked")
    parts = (candidate.get("content") or {}).get("parts") or []
    return "".join(part["text"] for part in parts if not part.get("thought") and isinstance(part.get("text"), str))


async def gemini_text(
    system: str,
    contents: list[dict[str, Any]],
    *,
    json_schema: dict[str, Any] | None = None,
    max_output_tokens: int = 4000,
    timeout: float = 120.0,
) -> str:
    """One complete reply. With `json_schema`, the reply is JSON that matches it (Gemini's OpenAPI subset)."""
    generation: dict[str, Any] = {"maxOutputTokens": max_output_tokens}
    if json_schema:
        generation |= {"responseMimeType": "application/json", "responseSchema": json_schema}
    model = os.environ.get("GEMINI_MODEL") or "gemini-flash-latest"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{BASE}/{model}:generateContent",
                headers={"x-goog-api-key": os.environ.get("GOOGLE_API_KEY", "")},
                json={
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": contents,
                    "generationConfig": generation,
                },
            )
    except httpx.HTTPError as error:
        raise GeminiError("api") from error
    if response.status_code in (401, 403):
        raise GeminiError("auth", response.status_code)
    if response.status_code == 429:
        raise GeminiError("rate_limit", response.status_code)
    if not response.is_success:
        raise GeminiError("api", response.status_code)
    return _text_of(response.json()).strip()
