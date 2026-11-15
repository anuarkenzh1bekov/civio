"""Retrieval over the curated law corpus: chunking, BM25, embeddings and hybrid search."""

from .retrieve import RAG_SYSTEM_PROMPT, evidence_context, evidence_fallback, retrieve_evidence

__all__ = ["RAG_SYSTEM_PROMPT", "evidence_context", "evidence_fallback", "retrieve_evidence"]
