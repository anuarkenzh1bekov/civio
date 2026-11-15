"""The server's half of the guided conversation: reading a short answer to the
question that was just asked, without a model. The order of the questions is
decided in the browser (web/src/lib/intake/flow.ts)."""

import re
from datetime import date
from typing import Any

from app.states import state_name

FLOW_FIELDS = (
    "currentState", "destinationState", "moveDate", "employment", "insurance",
    "hasVehicle", "drives", "hasChildren", "childAges",
)

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def format_date(iso: str) -> str:
    """"2027-01-05" → "Jan 5, 2027"."""
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return "Invalid Date"
    return f"{_MONTHS[d.month - 1]} {d.day}, {d.year}"


_EMPLOYMENT_TEXT = {"employee": "Employee", "self_employed": "Self-employed", "unemployed": "Not working"}
_INSURANCE_TEXT = {
    "employer": "Employer plan", "marketplace": "Marketplace plan", "medicaid": "Medicaid",
    "other": "Other insurance", "none": "No insurance",
}


def describe_patch(patch: dict[str, Any]) -> list[dict[str, str]]:
    """Short human labels for the fields a patch sets, e.g. "Moving to California"."""
    out: list[dict[str, str]] = []

    def add(field: str, text: str) -> None:
        out.append({"field": field, "text": text})

    if patch.get("currentState"):
        add("currentState", f"Moving from {state_name(patch['currentState'])}")
    if patch.get("destinationState"):
        add("destinationState", f"Moving to {state_name(patch['destinationState'])}")
    if patch.get("moveDate"):
        add("moveDate", format_date(patch["moveDate"]))
    if patch.get("employment"):
        add("employment", _EMPLOYMENT_TEXT[patch["employment"]])
    if patch.get("insurance"):
        add("insurance", _INSURANCE_TEXT[patch["insurance"]])
    if patch.get("hasVehicle") is not None:
        add("hasVehicle", "Bringing a vehicle" if patch["hasVehicle"] else "No vehicle")
    if patch.get("drives") is not None and patch.get("hasVehicle") is not True:
        add("drives", "Will drive" if patch["drives"] else "Won't drive")
    if patch.get("hasChildren") is False:
        add("hasChildren", "No children")
    if patch.get("childAges"):
        add("childAges", f"Children aged {', '.join(map(str, patch['childAges']))}")
    elif patch.get("hasChildren") is True:
        add("hasChildren", "Moving with children")
    return out


_FLAGS = re.IGNORECASE | re.ASCII
_SKIP = re.compile(r"\b(skip|not sure|don'?t know|dunno|no idea|later|prefer not|rather not|unsure)\b", _FLAGS)
_NO = re.compile(r"\b(no|nope|nah|don'?t|do not|doesn'?t|without|never|none)\b", _FLAGS)
_YES = re.compile(r"\b(yes|yeah|yep|yup|sure|i do|we do|have|bringing|will|correct)\b", _FLAGS)
_AGE = re.compile(r"\b\d{1,2}\b", re.ASCII)
_EMPLOYMENT = [
    (re.compile(r"self[- ]?employed|freelanc|contractor|1099|own business", _FLAGS), {"employment": "self_employed", "income": "1099"}),
    (re.compile(r"unemploy|between jobs|not working|retired|student", _FLAGS), {"employment": "unemployed", "income": "none"}),
    (re.compile(r"employee|employed|full[- ]?time|part[- ]?time|w-?2|\bjob\b|salary", _FLAGS), {"employment": "employee", "income": "w2"}),
]
_INSURANCE = [
    (re.compile(r"\bnone\b|no insurance|uninsured|not insured", _FLAGS), "none"),
    (re.compile(r"medicaid|medi-cal", _FLAGS), "medicaid"),
    (re.compile(r"marketplace|obamacare|\baca\b|healthcare\.gov|covered ?ca", _FLAGS), "marketplace"),
    (re.compile(r"employer|work|company|\bjob\b", _FLAGS), "employer"),
    (re.compile(r"other|private|cobra|parents?", _FLAGS), "other"),
]
_YES_NO = {
    "hasVehicle": ({"hasVehicle": True}, {"hasVehicle": False}),
    "drives": ({"drives": True}, {"drives": False}),
    "hasChildren": ({"hasChildren": True}, {"hasChildren": False, "childAges": []}),
}


def answer_from_rules(field: str | None, text: str) -> dict[str, Any]:
    """Read a short answer to the question that was just asked. Used when no AI key
    is set or the model is unavailable. Returns {"patch": ..., "declined": [...]}."""

    def patch(values: dict[str, Any]) -> dict[str, Any]:
        return {"patch": values, "declined": []}

    if not field:
        return patch({})
    t = text.strip()
    if _SKIP.search(t):
        return {"patch": {}, "declined": [field]}
    if field in _YES_NO:
        yes, no = _YES_NO[field]
        if _NO.search(t):
            return patch(dict(no))
        if _YES.search(t):
            return patch(dict(yes))
    elif field == "childAges":
        ages = [n for n in map(int, _AGE.findall(t)) if n <= 25]
        if ages:
            return patch({"hasChildren": True, "childAges": ages})
    elif field == "employment":
        for pattern, values in _EMPLOYMENT:
            if pattern.search(t):
                return patch(dict(values))
    elif field == "insurance":
        for pattern, value in _INSURANCE:
            if pattern.search(t):
                return patch({"insurance": value})
    return patch({})
