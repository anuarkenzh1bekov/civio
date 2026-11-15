"""Gemini embeddings over REST. The key travels in a header, never in a URL."""

from __future__ import annotations

import os
from typing import Literal

import httpx

from .core import normalize_vector

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:batchEmbedContents"

TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


async def embed_texts(
    texts: list[str],
    task_type: TaskType,
    *,
    api_key: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[list[float]]:
    """Same model/dimensions for ingestion and queries; document/query task types differ."""
    api_key = api_key or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Embeddings require GOOGLE_API_KEY")
    if not texts:
        return []
    if len(texts) > 32:
        raise ValueError("Embedding batch exceeds 32 texts")
    body = {"requests": [
        {"model": f"models/{EMBEDDING_MODEL}", "content": {"parts": [{"text": text}]},
         "taskType": task_type, "outputDimensionality": EMBEDDING_DIMENSIONS}
        for text in texts
    ]}
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    if client is None:
        async with httpx.AsyncClient(timeout=20) as own:
            response = await own.post(_URL, json=body, headers=headers)
    else:
        response = await client.post(_URL, json=body, headers=headers, timeout=20)
    if not response.is_success:
        raise RuntimeError(f"Embedding API HTTP {response.status_code}")
    embeddings = response.json().get("embeddings")
    if not isinstance(embeddings, list) or len(embeddings) != len(texts):
        raise RuntimeError("Incomplete embedding batch")
    return [normalize_vector(embedding.get("values"), EMBEDDING_DIMENSIONS) for embedding in embeddings]
