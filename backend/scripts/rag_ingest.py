"""Re-download the directly fetchable sources into data/rag/corpus.json.

Run from backend/:  python -m scripts.rag_ingest
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.rag.core import JS_WHITESPACE, digest, js_trim

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "rag"

SOURCES: list[dict[str, Any]] = [
    {"id": "tx-licenses", "state": "TX", "kind": "statute", "title": "Texas Transportation Code Chapter 521",
     "url": "https://tcss.legis.texas.gov/resources/TN/htm/TN.521.htm", "sections": ["521.029", "521.054", "521.142", "521.144"]},
    {"id": "tx-registration", "state": "TX", "kind": "statute", "title": "Texas Transportation Code Chapter 502",
     "url": "https://tcss.legis.texas.gov/resources/TN/htm/TN.502.htm", "sections": ["502.040"]},
    {"id": "tx-new-residents", "state": "TX", "kind": "agency-guidance", "title": "Texas DMV — New to Texas",
     "url": "https://www.txdmv.gov/motorists/new-to-texas", "element": "article"},
    {"id": "ca-residency-tax", "state": "CA", "kind": "agency-guidance", "title": "California FTB — Part-year residents and nonresidents",
     "url": "https://www.ftb.ca.gov/file/personal/residency-status/part-year-and-nonresident.html", "element": "main"},
    {"id": "ca-health-enrollment", "state": "CA", "kind": "agency-guidance", "title": "Covered California — Special enrollment",
     "url": "https://www.coveredca.com/special-enrollment/", "element": "main"},
]

_ENTITIES = {"nbsp": " ", "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'",
             "rsquo": "’", "lsquo": "‘", "ndash": "–", "mdash": "—"}
# re.ASCII keeps \b, \w and \d as narrow as they are in JavaScript; whitespace uses the JS set.
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HIDDEN = re.compile(r"<(script|style|nav|footer|noscript)\b[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE | re.ASCII)
_TAG = re.compile(r"<[^>]*>")
_ENTITY = re.compile(r"&(#x[\da-f]+|#\d+|\w+);", re.IGNORECASE | re.ASCII)
_WS = re.compile(f"[{JS_WHITESPACE}]+")
_NEXT_SECTION = re.compile(r'<a name="\d{3}\.\d{3,}"', re.ASCII)
_BLOCKED = re.compile(r"access denied|just a moment|captcha", re.IGNORECASE)


def now_iso() -> str:
    """The timestamp format of JavaScript's Date.toISOString()."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _entity(match: re.Match[str]) -> str:
    code = match.group(1)
    if code[0] != "#":
        return _ENTITIES.get(code.lower(), match.group(0))
    number = int(code[2:], 16) if code[1].lower() == "x" else int(code[1:], 10)
    return chr(number) if 0 < number <= 0x10FFFF else match.group(0)


def html_text(html: str) -> str:
    text = _COMMENT.sub("", html)
    text = _HIDDEN.sub("", text)
    text = _TAG.sub(" ", text)
    text = _ENTITY.sub(_entity, text)
    return js_trim(_WS.sub(" ", text))


def extract_documents(source: dict[str, Any], html: str, retrieved_at: str | None = None) -> list[dict[str, Any]]:
    # Key order is part of the corpus hash, so it stays as the first import wrote it.
    metadata = {"state": source.get("state"), "kind": source.get("kind"), "retrievedAt": retrieved_at or now_iso(),
                "retrievalMethod": "direct-http", "rawFile": f"raw/{source['id']}.html", "rawSha256": digest(html)}
    if source.get("sections"):
        documents = []
        for section in source["sections"]:
            anchor = f'<a name="{section}">'
            start = html.find(anchor)
            if start < 0:
                raise ValueError(f"Section {section} missing")
            tail = html[start + len(anchor):]
            following = _NEXT_SECTION.search(tail)
            text = html_text(tail[:following.start()] if following else tail)
            if len(text) < 100:
                raise ValueError(f"Empty section {section}")
            documents.append({**metadata, "id": f"{source['id']}-{section}", "title": f"{source.get('title')} §{section}",
                              "url": f"{source.get('url')}#{section}", "text": text})
        return documents
    element = source.get("element")
    body = re.search(rf"<{element}\b[^>]*>(.*?)</{element}>", html, re.DOTALL | re.IGNORECASE | re.ASCII)
    if not body or not body.group(1):
        raise ValueError(f"Content element missing for {source['id']}")
    text = html_text(body.group(1))
    if len(text) < 200 or _BLOCKED.search(text[:300]):
        raise ValueError(f"Unusable source {source['id']}")
    return [{**metadata, "id": source["id"], "title": source.get("title"), "url": source.get("url"), "text": text}]


def write_json(target: Path, value: Any, *, indent: int | None = None) -> None:
    """Write through a temp file, formatted the way JSON.stringify would."""
    separators = None if indent else (",", ":")
    temp = target.with_name(target.name + ".tmp")
    temp.write_text(json.dumps(value, indent=indent, separators=separators, ensure_ascii=False), encoding="utf-8", newline="")
    os.replace(temp, target)


def ingest(client: httpx.Client | None = None, data_dir: Path = DATA_DIR) -> dict[str, Any]:
    target = data_dir / "corpus.json"
    previous: dict[str, Any] = {"documents": []}
    try:
        previous = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass  # first import
    # Snapshots that this script cannot re-download (web extracts, statutes copied from the
    # official bulk archives) are carried over as they are.
    documents = [d for d in previous["documents"] if d.get("retrievalMethod") in ("web-extract", "bulk-archive")]
    (data_dir / "raw").mkdir(parents=True, exist_ok=True)
    failures: list[dict[str, str]] = []
    own = client is None
    http = client or httpx.Client(timeout=20, follow_redirects=True)
    try:
        for source in SOURCES:
            try:
                response = http.get(source["url"])
                if not response.is_success:
                    raise RuntimeError(f"HTTP {response.status_code}")
                html = response.text
                extracted = extract_documents(source, html)
                (data_dir / "raw" / f"{source['id']}.html").write_text(html, encoding="utf-8", newline="")
                documents.extend(extracted)
            except Exception as error:
                failures.append({"id": source["id"], "error": str(error)})
                # Retain last known good text, without falsely advancing its retrieval date.
                documents.extend(d for d in previous["documents"]
                                 if d["id"] == source["id"] or d["id"].startswith(f"{source['id']}-"))
    finally:
        if own:
            http.close()
    if not documents:
        raise RuntimeError("No official source could be downloaded")
    write_json(target, {
        "version": previous.get("version") or 1,
        "scope": previous.get("scope") or "Curated relocation sources for TX, CA, FL, WA and NY; not complete state codes",
        "documents": documents,
    }, indent=2)
    return {"documents": len(documents), "failures": failures}


if __name__ == "__main__":
    result = ingest()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result["failures"]:
        sys.exit(1)
