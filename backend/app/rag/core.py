"""Chunking, BM25 and hybrid ranking. Pure functions, no I/O.

The index in data/rag/index.json was built by this code's JavaScript predecessor, and
chunk ids are content hashes, so word splitting and hashing here have to stay
byte-for-byte compatible with it (see JS_WHITESPACE).
"""

from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from typing import Any, Iterable

SEMANTIC_WEIGHT = 0.7
LEXICAL_WEIGHT = 0.3

Chunk = dict[str, Any]
Document = dict[str, Any]
Hit = dict[str, Any]

# What JavaScript's \s and String.prototype.trim() treat as whitespace. Python's
# str.split() uses a different set (no U+FEFF, extra control characters).
JS_WHITESPACE = "\t\n\v\f\r    -     　﻿"
_WS_RUN = re.compile(f"[{JS_WHITESPACE}]+")
_WS_EDGES = re.compile(f"^[{JS_WHITESPACE}]+|[{JS_WHITESPACE}]+$")

STOP = frozenset(
    "a an the and or to of in on for is are be i my me you your do does how what when why with from can must "
    "мне я как что где когда зачем нужно ли в на из и или".split(" ")
)
# Small, deterministic lexical normalization; semantic matching still uses original text.
LEXEMES = {
    "car": "vehicle", "cars": "vehicle", "vehicles": "vehicle", "automobile": "vehicle",
    "register": "registration", "registered": "registration", "registering": "registration",
    "licence": "license", "licenses": "license", "licensing": "license", "dl": "license",
    "residents": "resident", "residency": "resident", "moving": "move", "moved": "move",
    "taxes": "tax", "documents": "document",
}

# Letters and digits in any script, joined by . ' or - ("521.029", "medi-cal").
_TOKEN = re.compile(r"[^\W_]+(?:[.'-][^\W_]+)*")


def js_trim(text: str) -> str:
    return _WS_EDGES.sub("", text)


def js_split_words(text: str) -> list[str]:
    """`text.trim().split(/\\s+/u)`."""
    return _WS_RUN.split(js_trim(text))


def tokenize(text: str) -> list[str]:
    words = _TOKEN.findall(unicodedata.normalize("NFKC", text).lower())
    return [LEXEMES.get(word, word) for word in words if word not in STOP]


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _subsection_ranges(words: list[str]) -> list[tuple[int, int]]:
    """Word ranges [start, end) of a statute's top-level subsections: "(a)", "(b)", ..."""
    starts = [0]
    expected = "a"
    for i, word in enumerate(words):
        # Only the next letter in sequence counts, so "subdivision (a)" in a later
        # subsection does not start a new one.
        if i > 0 and word == f"({expected})":
            starts.append(i)
            expected = chr(ord(expected) + 1)
        elif i == 0 and word == "(a)":
            expected = "b"
    return [(start, starts[i + 1] if i + 1 < len(starts) else len(words)) for i, start in enumerate(starts)]


def _windows(start_at: int, end_at: int, size: int, overlap: int) -> list[tuple[int, int]]:
    """Window ranges for the fixed-size fallback."""
    ranges: list[tuple[int, int]] = []
    start = start_at
    while start < end_at:
        ranges.append((start, min(start + size, end_at)))
        if start + size >= end_at:
            break
        start += size - overlap
    return ranges


def _chunk_ranges(doc: Document, words: list[str], size: int, overlap: int) -> list[tuple[int, int]]:
    """Statutes are cut on subsection boundaries, packing whole subsections up to
    `size` words, so a rule and its deadline stay in one chunk. A subsection
    longer than `size`, and every other kind of document, uses overlapping windows."""
    if doc.get("kind") != "statute":
        return _windows(0, len(words), size, overlap)
    ranges: list[tuple[int, int]] = []
    current: tuple[int, int] | None = None
    for start, end in _subsection_ranges(words):
        if end - start > size:
            if current:
                ranges.append(current)
            current = None
            ranges.extend(_windows(start, end, size, overlap))
        elif current and end - current[0] <= size:
            current = (current[0], end)
        else:
            if current:
                ranges.append(current)
            current = (start, end)
    if current:
        ranges.append(current)
    return ranges


def chunk_documents(documents: Iterable[Document], size: int = 280, overlap: int = 45) -> list[Chunk]:
    """Bounded chunks; original wording and word offsets remain auditable."""
    if size <= overlap or overlap < 0:
        raise ValueError("Invalid chunk window")
    chunks: list[Chunk] = []
    for doc in documents:
        words = js_split_words(doc["text"])
        for start, end in _chunk_ranges(doc, words, size, overlap):
            text = " ".join(words[start:end])
            chunks.append({
                "id": f"{doc['id']}:{start}:{digest(text)[:12]}", "documentId": doc["id"],
                "title": doc.get("title"), "state": doc.get("state"), "kind": doc.get("kind"), "url": doc.get("url"),
                "retrievedAt": doc.get("retrievedAt"), "retrievalMethod": doc.get("retrievalMethod"),
                "startWord": start, "text": text,
            })
    return chunks


def bm25(query: str, documents: list[str]) -> list[float]:
    """Okapi BM25 with document length normalization, k1=1.5, b=0.75."""
    terms = list(dict.fromkeys(tokenize(query)))
    docs = [tokenize(document) for document in documents]
    average = (sum(len(d) for d in docs) / (len(docs) or 1)) or 1
    frequencies: list[dict[str, int]] = []
    for d in docs:
        counts: dict[str, int] = {}
        for term in d:
            counts[term] = counts.get(term, 0) + 1
        frequencies.append(counts)
    idf: dict[str, float] = {}
    for term in terms:
        df = sum(1 for counts in frequencies if term in counts)
        idf[term] = math.log(1 + (len(docs) - df + 0.5) / (df + 0.5))
    scores: list[float] = []
    for d, counts in zip(docs, frequencies):
        total = 0.0
        for term in terms:
            tf = counts.get(term, 0)
            total += idf[term] * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * len(d) / average))
        scores.append(total)
    return scores


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def normalize_vector(vector: Any, dimensions: int) -> list[float]:
    if not isinstance(vector, list) or len(vector) != dimensions or not all(_is_finite_number(x) for x in vector):
        raise ValueError("Invalid embedding dimensions or values")
    norm = math.hypot(*vector)
    if not norm:
        raise ValueError("Zero embedding")
    return [x / norm for x in vector]


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        raise ValueError("Embedding dimension mismatch")
    dot = aa = bb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        aa += x * x
        bb += y * y
    return max(-1.0, min(1.0, dot / math.sqrt(aa * bb))) if aa and bb else 0.0


# JavaScript's \b is ASCII-only, hence re.ASCII; the Cyrillic stems need Unicode case folding.
_CA = re.compile(r"\bcalifornia\b|\bCA\b", re.ASCII | re.IGNORECASE)
_CA_RU = re.compile("калифорни", re.IGNORECASE)
_TX = re.compile(r"\btexas\b|\bTX\b", re.ASCII | re.IGNORECASE)
_TX_RU = re.compile("техас", re.IGNORECASE)
_NY_RU = re.compile("нью[ -]йорк", re.IGNORECASE)
# Unsupported jurisdictions must not silently retrieve California evidence.
_OTHER_STATES = (
    "AL:Alabama;AK:Alaska;AZ:Arizona;AR:Arkansas;CO:Colorado;CT:Connecticut;DE:Delaware;DC:District of Columbia;"
    "FL:Florida;GA:Georgia;HI:Hawaii;ID:Idaho;IL:Illinois;IN:Indiana;IA:Iowa;KS:Kansas;KY:Kentucky;LA:Louisiana;"
    "ME:Maine;MD:Maryland;MA:Massachusetts;MI:Michigan;MN:Minnesota;MS:Mississippi;MO:Missouri;MT:Montana;"
    "NE:Nebraska;NV:Nevada;NH:New Hampshire;NJ:New Jersey;NM:New Mexico;NY:New York;NC:North Carolina;"
    "ND:North Dakota;OH:Ohio;OK:Oklahoma;OR:Oregon;PA:Pennsylvania;RI:Rhode Island;SC:South Carolina;"
    "SD:South Dakota;TN:Tennessee;UT:Utah;VT:Vermont;VA:Virginia;WA:Washington;WV:West Virginia;WI:Wisconsin;WY:Wyoming"
)
_OTHER_PATTERNS = [
    (code, re.compile(rf"\b{name}\b", re.ASCII | re.IGNORECASE),
     re.compile(rf"(?:in|to|from|state of)[{JS_WHITESPACE}]+{code}\b", re.ASCII))
    for code, name in (entry.split(":") for entry in _OTHER_STATES.split(";"))
]


def select_states(question: str, profile: dict[str, Any] | None) -> list[str]:
    """Explicit state in question wins; otherwise restrict to the shared move's states."""
    explicit: list[str] = []
    if _CA.search(question) or _CA_RU.search(question):
        explicit.append("CA")
    if _TX.search(question) or _TX_RU.search(question):
        explicit.append("TX")
    for code, by_name, by_code in _OTHER_PATTERNS:
        if by_name.search(question) or by_code.search(question):
            explicit.append(code)
    if _NY_RU.search(question):
        explicit.append("NY")
    if explicit:
        return list(dict.fromkeys(explicit))
    profile = profile or {}
    return list(dict.fromkeys(s for s in (profile.get("currentState"), profile.get("destinationState")) if s))


def hybrid_search(
    chunks: list[Chunk],
    question: str,
    query_vector: list[float] | None,
    *,
    states: list[str] | None = None,
    limit: int = 6,
    min_semantic: float = 0.5,
) -> list[Hit]:
    """70% cosine [0,1] + 30% BM25 / query max. No hidden profile score boosts."""
    states = states or []
    candidates = [c for c in chunks if not states or c.get("state") == "US" or c.get("state") in states]
    lexical = bm25(question, [f"{c.get('title')}\n{c['text']}" for c in candidates])
    max_lexical = max([0.0, *lexical])
    has_vector = query_vector is not None
    results: list[Hit] = []
    for chunk, score in zip(candidates, lexical):
        semantic = max(0.0, cosine(query_vector, chunk["embedding"])) if has_vector and chunk.get("embedding") else 0.0
        normalized = score / max_lexical if max_lexical else 0.0
        hit = {"chunk": chunk, "semantic": semantic, "lexical": score, "normalizedLexical": normalized,
               "score": SEMANTIC_WEIGHT * semantic + LEXICAL_WEIGHT * normalized if has_vector else normalized}
        if (semantic >= min_semantic) if has_vector else (score > 0):
            results.append(hit)
    results.sort(key=lambda hit: (-hit["score"], hit["chunk"]["id"]))
    # Prevent a long chapter from crowding every other source out of the prompt.
    counts: dict[str, int] = {}
    kept: list[Hit] = []
    for hit in results:
        count = counts.get(hit["chunk"]["documentId"], 0)
        counts[hit["chunk"]["documentId"]] = count + 1
        if count < 3:
            kept.append(hit)
    return kept[:limit]
