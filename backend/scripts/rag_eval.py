"""Retrieval check with real Gemini query embeddings.

Run from backend/:  python -m scripts.rag_eval   (needs GOOGLE_API_KEY)
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Callable

from app.rag.core import hybrid_search, select_states
from app.rag.embeddings import embed_texts
from scripts._env import load_env_files
from scripts.rag_ingest import DATA_DIR

CASES: list[dict[str, Any]] = [
    {"question": "How long can a new Texas resident drive using an out of state license?", "expected": "tx-licenses-521.029"},
    {"question": "After moving to Texas, how long can I keep driving on my old license?", "expected": "tx-licenses-521.029"},
    {"question": "What must a new Texas resident submit with a driver license application?", "expected": "tx-licenses-521.144"},
    {"question": "How many days do I have to register my car after moving to Texas?", "expected": "tx-registration-502.040"},
    {"question": "Why do I need to get a new driver license after moving to California?", "expected": "ca-dmv-driver-license"},
    {"question": "Do I pay California tax on income earned before moving there?", "expected": "ca-residency-tax"},
    {"question": "Can moving qualify me for health insurance outside open enrollment in California?", "expected": "ca-health-enrollment"},
    {"question": "How long does a California landlord have to return my security deposit?", "expected": "ca-civ-1950.5"},
    {"question": "When does a Texas landlord have to refund my security deposit?", "expected": "tx-pr-92.103"},
    {"question": "What are the minimum auto insurance limits in California?", "expected": "ca-veh-16056"},
    {"question": "When am I considered a California resident for income tax?", "expected": ["ca-rtc-17014", "ca-residency-tax"]},
    {"question": "Which vaccines does my child need to start school in California?", "expected": "ca-hsc-120335"},
    {"question": "How do I cook pasta carbonara?", "expected": None},
    {"question": "Who won the football world cup?", "expected": None},
    {"question": "What are the driver license requirements in Ohio?", "expected": None},
    {"question": "How many days do I have to register my car after moving to Florida?", "expected": "fl-320.38"},
    {"question": "How long does a Florida landlord have to return my security deposit?", "expected": "fl-83.49"},
    {"question": "Do I need a Florida driver license if I start a job there?", "expected": "fl-322.031"},
    {"question": "How soon must I get a Washington driver license after moving?", "expected": "wa-46.20.021"},
    {"question": "How many days does a Washington landlord have to return a deposit?", "expected": "wa-59.18.280"},
    {"question": "When do I have to register my vehicle in Washington as a new resident?", "expected": "wa-46.16A.140"},
    {"question": "How long do I have to register my car after moving to New York?", "expected": "ny-dmv-register-out-of-state"},
    {"question": "Do I have to get a New York driver license when I move there?", "expected": ["ny-dmv-driving", "ny-dmv-moving"]},
    {"question": "Which tax return do I file if I move into New York mid-year?", "expected": "ny-tax-it203"},
    {"question": "How long does a New York landlord have to return the security deposit?", "expected": "ny-ag-deposit"},
]


async def evaluate(
    *, api_key: str | None = None, progress: Callable[[str], None] = print, data_dir: Path = DATA_DIR,
) -> list[dict[str, Any]]:
    index = json.loads((data_dir / "index.json").read_text(encoding="utf-8"))
    vectors = await embed_texts([case["question"] for case in CASES], "RETRIEVAL_QUERY", api_key=api_key)
    results = []
    for case, vector in zip(CASES, vectors):
        hits = hybrid_search(index["chunks"], case["question"], vector,
                             states=select_states(case["question"], case.get("profile")))
        expected = case["expected"]
        accepted = expected if isinstance(expected, list) else [expected]
        passed = any(h["chunk"]["documentId"] in accepted for h in hits[:3]) if expected else len(hits) == 0
        results.append({
            "question": case["question"], "passed": passed, "expected": expected,
            "top": [{"id": h["chunk"]["documentId"], "semantic": round(h["semantic"], 3),
                     "bm25": round(h["normalizedLexical"], 3), "score": round(h["score"], 3)} for h in hits[:3]],
        })
    for result in results:
        progress(json.dumps(result, ensure_ascii=False))
    progress(f"{sum(1 for r in results if r['passed'])}/{len(results)} retrieval cases passed (real Gemini query embeddings)")
    return results


if __name__ == "__main__":
    load_env_files()
    if any(not result["passed"] for result in asyncio.run(evaluate())):
        sys.exit(1)
