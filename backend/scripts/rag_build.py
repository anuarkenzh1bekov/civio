"""Embed new or changed chunks and write data/rag/index.json.

Run from backend/:  python -m scripts.rag_build   (needs GOOGLE_API_KEY)
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Callable

import httpx

from app.rag.core import chunk_documents, normalize_vector
from app.rag.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embed_texts
from app.rag.retrieve import corpus_hash
from scripts._env import load_env_files
from scripts.rag_ingest import DATA_DIR, now_iso, write_json


async def build_index(
    *,
    api_key: str | None = None,
    client: httpx.AsyncClient | None = None,
    progress: Callable[[str], None] = print,
    data_dir: Path = DATA_DIR,
) -> dict[str, Any]:
    corpus = json.loads((data_dir / "corpus.json").read_text(encoding="utf-8"))
    chunks = chunk_documents(corpus["documents"])
    existing: dict[str, Any] | None = None
    try:
        existing = json.loads((data_dir / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass  # first build
    reusable: dict[str, dict[str, Any]] = {}
    if existing and existing.get("model") == EMBEDDING_MODEL and existing.get("dimensions") == EMBEDDING_DIMENSIONS:
        reusable = {c["id"]: c for c in existing["chunks"]}
    pending = []
    for chunk in chunks:
        previous = reusable.get(chunk["id"])
        if previous and previous.get("text") == chunk["text"] and previous.get("title") == chunk["title"]:
            try:
                chunk["embedding"] = normalize_vector(previous.get("embedding"), EMBEDDING_DIMENSIONS)
            except ValueError:
                pass  # re-embed corrupt cache entry
        if not chunk.get("embedding"):
            pending.append(chunk)
    for i in range(0, len(pending), 16):
        batch = pending[i:i + 16]
        vectors = await embed_texts([f"{c['title']}\n{c['text']}" for c in batch], "RETRIEVAL_DOCUMENT",
                                    api_key=api_key, client=client)
        for chunk, vector in zip(batch, vectors):
            chunk["embedding"] = vector
        progress(f"Embedded {min(i + 16, len(pending))}/{len(pending)} new chunks")
    index = {"version": 1, "model": EMBEDDING_MODEL, "dimensions": EMBEDDING_DIMENSIONS,
             "corpusHash": corpus_hash(corpus["documents"]), "builtAt": now_iso(), "chunks": chunks}
    write_json(data_dir / "index.json", index)
    progress(f"Ready: {len(corpus['documents'])} documents, {len(chunks)} chunks, semantic 70% / BM25 30%")
    return index


if __name__ == "__main__":
    load_env_files()
    asyncio.run(build_index())
