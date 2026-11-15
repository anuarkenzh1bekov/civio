"""One-off import of the Florida, Washington and New York sources into corpus.json.

Reads pages saved by the fetch step in the directory given as the first argument.
Run from backend/:  python -m scripts.rag_add_states <directory>
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.rag.core import JS_WHITESPACE, digest, js_trim
from scripts.rag_ingest import DATA_DIR, html_text, now_iso, write_json

FL = "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL="
DOCS: list[dict[str, str]] = [
    {"id": "fl-83.49", "file": "fl83", "state": "FL", "kind": "statute", "title": "Florida Statutes §83.49 — Deposit money or advance rent; duty of landlord and tenant", "url": f"{FL}0000-0099/0083/Sections/0083.49.html", "mode": "fl"},
    {"id": "fl-320.02", "file": "fl320_02", "state": "FL", "kind": "statute", "title": "Florida Statutes §320.02 — Registration required; application for registration", "url": f"{FL}0300-0399/0320/Sections/0320.02.html", "mode": "fl"},
    {"id": "fl-320.38", "file": "fl320", "state": "FL", "kind": "statute", "title": "Florida Statutes §320.38 — When nonresident exemption does not apply", "url": f"{FL}0300-0399/0320/Sections/0320.38.html", "mode": "fl"},
    {"id": "fl-322.031", "file": "fl322", "state": "FL", "kind": "statute", "title": "Florida Statutes §322.031 — Nonresident driver license exemption", "url": f"{FL}0300-0399/0322/Sections/0322.031.html", "mode": "fl"},
    {"id": "fl-324.022", "file": "fl324", "state": "FL", "kind": "statute", "title": "Florida Statutes §324.022 — Financial responsibility for property damage", "url": f"{FL}0300-0399/0324/Sections/0324.022.html", "mode": "fl"},
    {"id": "fl-627.733", "file": "fl627_733", "state": "FL", "kind": "statute", "title": "Florida Statutes §627.733 — Required security (no-fault insurance)", "url": f"{FL}0600-0699/0627/Sections/0627.733.html", "mode": "fl"},
    {"id": "wa-46.20.021", "file": "wa4620", "state": "WA", "kind": "statute", "title": "RCW 46.20.021 — New residents (driver license)", "url": "https://app.leg.wa.gov/RCW/default.aspx?cite=46.20.021", "mode": "wa"},
    {"id": "wa-46.16A.140", "file": "wa46", "state": "WA", "kind": "statute", "title": "RCW 46.16A.140 — Vehicle registration for new residents", "url": "https://app.leg.wa.gov/RCW/default.aspx?cite=46.16A.140", "mode": "wa"},
    {"id": "wa-46.30.020", "file": "wa4630", "state": "WA", "kind": "statute", "title": "RCW 46.30.020 — Financial responsibility (auto insurance)", "url": "https://app.leg.wa.gov/RCW/default.aspx?cite=46.30.020", "mode": "wa"},
    {"id": "wa-59.18.280", "file": "wa59", "state": "WA", "kind": "statute", "title": "RCW 59.18.280 — Residential security deposits", "url": "https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.280", "mode": "wa"},
    {"id": "ny-dmv-moving", "file": "nymove", "state": "NY", "kind": "agency-guidance", "title": "New York DMV — Moving to or from New York State", "url": "https://dmv.ny.gov/more-info/moving-to-or-from-new-york-state", "mode": "main"},
    {"id": "ny-dmv-register-out-of-state", "file": "nyoos", "state": "NY", "kind": "agency-guidance", "title": "New York DMV — Register an out-of-state vehicle", "url": "https://dmv.ny.gov/registration/register-an-out-of-state-vehicle", "mode": "main"},
    {"id": "ny-dmv-driving", "file": "nyd", "state": "NY", "kind": "agency-guidance", "title": "New York DMV — Driving in New York State", "url": "https://dmv.ny.gov/driver-license/driving-in-new-york-state", "mode": "main"},
    {"id": "ny-tax-it203", "file": "it203", "state": "NY", "kind": "agency-guidance", "title": "New York Tax Dept — IT-203 nonresident and part-year resident return", "url": "https://www.tax.ny.gov/pit/ads/it203_information.htm", "mode": "main"},
]

_MAIN = re.compile(r"<main\b[^>]*>(.*?)</main>", re.DOTALL | re.IGNORECASE | re.ASCII)
_WS = re.compile(f"[{JS_WHITESPACE}]+")
_BLOCKED = re.compile(r"just a moment|access denied", re.IGNORECASE)
_DEPOSIT = re.compile(r"[^.]{0,300}return the security deposit within 14 days.{0,1100}", re.DOTALL | re.IGNORECASE)


def _between(html: str, start_marker: str, end_marker: str) -> str:
    # Mirrors the original slice arithmetic, including a marker that is not found (-1).
    start = html.find(start_marker)
    end = html.find(end_marker, max(start, 0))
    return html_text(html[start:end if end > 0 else start + 60000])


def extract(doc: dict[str, str], html: str) -> str:
    if doc["mode"] == "fl":
        return _between(html, '<div class="Section">', '<div class="Note"')
    if doc["mode"] == "wa":
        return _between(html, "id='contentWrapper'", "</div></div></div>")
    body = _MAIN.search(html)
    return html_text(body.group(1) if body else html)


def add_states(directory: Path, data_dir: Path = DATA_DIR) -> None:
    target = data_dir / "corpus.json"
    corpus: dict[str, Any] = json.loads(target.read_text(encoding="utf-8"))
    (data_dir / "raw").mkdir(parents=True, exist_ok=True)
    retrieved_at = now_iso()
    for doc in DOCS:
        html = (directory / f"{doc['file']}.html").read_text(encoding="utf-8")
        text = extract(doc, html)
        if len(text) < 300:
            raise ValueError(f"{doc['id']}: too short ({len(text)})")
        if _BLOCKED.search(text[:200]):
            raise ValueError(f"{doc['id']}: blocked")
        entry = {"state": doc["state"], "kind": doc["kind"], "retrievedAt": retrieved_at, "retrievalMethod": "web-extract",
                 "rawFile": f"raw/{doc['id']}.txt", "rawSha256": digest(html), "id": doc["id"], "title": doc["title"],
                 "url": doc["url"], "text": text}
        (data_dir / "raw" / f"{doc['id']}.txt").write_text(text, encoding="utf-8", newline="")
        corpus["documents"] = [d for d in corpus["documents"] if d["id"] != doc["id"]]
        corpus["documents"].append(entry)
        print(doc["id"], len(text))
    # NY security deposit rule: Attorney General tenants' rights guide (PDF, text via pdftotext).
    output = subprocess.run(["pdftotext", "-layout", str(directory / "tenants.pdf"), "-"], capture_output=True, check=True).stdout
    raw = _WS.sub(" ", output.decode("utf-8", errors="replace"))
    deposit = _DEPOSIT.search(raw)
    if deposit:
        text = "New York Attorney General, Residential Tenants' Rights Guide, security deposits: " + js_trim(deposit.group(0))
        corpus["documents"] = [d for d in corpus["documents"] if d["id"] != "ny-ag-deposit"]
        corpus["documents"].append({
            "state": "NY", "kind": "agency-guidance", "retrievedAt": retrieved_at, "retrievalMethod": "web-extract",
            "rawFile": "raw/ny-ag-deposit.txt", "rawSha256": digest(raw), "id": "ny-ag-deposit",
            "title": "New York Attorney General — Residential Tenants' Rights Guide (security deposits)",
            "url": "https://ag.ny.gov/sites/default/files/tenants_rights.pdf", "text": text,
        })
        (data_dir / "raw" / "ny-ag-deposit.txt").write_text(text, encoding="utf-8", newline="")
        print("ny-ag-deposit", len(text))
    else:
        print("deposit passage not found")
    corpus["version"] = (corpus.get("version") or 1) + 1
    corpus["scope"] = "Curated relocation sources for TX, CA, FL, WA and NY; not complete state codes"
    write_json(target, corpus, indent=2)
    print("documents", len(corpus["documents"]))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python -m scripts.rag_add_states <directory with the saved pages>")
    add_states(Path(sys.argv[1]))
