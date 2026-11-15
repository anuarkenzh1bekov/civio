"""The rule engine. A profile is a plain dict with the browser's field names;
a missing key means the question was skipped, which is different from "no"."""

import json
from datetime import date, timedelta
from functools import cmp_to_key
from pathlib import Path
from typing import Any

from app.states import state_name

Profile = dict[str, Any]
Rule = dict[str, Any]
Task = dict[str, Any]

RULES: list[Rule] = json.loads((Path(__file__).parent / "rules.json").read_text(encoding="utf-8"))

# What the user would have to answer for a fact to become known.
FACT_QUESTION = {
    "moving_between_states": "your current and destination state",
    "employment": "your employment type",
    "income": "your income type",
    "has_self_employment_income": "your employment or income type",
    "has_children": "whether you have children",
    "has_school_age_child": "your children's ages",
    "insurance": "your health insurance type",
    "has_vehicle": "whether you own a vehicle",
    "drives": "whether you will drive after the move",
    "has_vehicle_or_drives": "whether you will bring a vehicle or drive after the move",
    "destination_state": "your destination state",
    "origin_state": "your current state",
}


def derive_facts(profile: Profile) -> dict[str, str | bool | None]:
    """Derive every fact from the profile. None means unknown: a skipped question never counts as a "no"."""
    current = profile.get("currentState")
    destination = profile.get("destinationState")
    employment = profile.get("employment")
    income = profile.get("income")
    has_children = profile.get("hasChildren")
    child_ages = profile.get("childAges")
    has_vehicle = profile.get("hasVehicle")
    drives = profile.get("drives")

    self_employment: bool | None = None
    if employment == "self_employed" or income in ("1099", "both"):
        self_employment = True
    elif employment is not None and income is not None:
        self_employment = False

    school_age: bool | None = None
    if has_children is False:
        school_age = False
    elif has_children is True and child_ages:
        # Kindergarten through grade 12. Conditions on exact cut-off dates live in the rule text.
        school_age = any(5 <= age <= 18 for age in child_ages)

    vehicle_or_drives: bool | None = None
    if has_vehicle or drives:
        vehicle_or_drives = True
    elif has_vehicle is False and drives is False:
        vehicle_or_drives = False

    return {
        "moving_between_states": current != destination if current and destination else None,
        "employment": employment,
        "income": income,
        "has_self_employment_income": self_employment,
        "has_children": has_children,
        "has_school_age_child": school_age,
        "insurance": profile.get("insurance"),
        "has_vehicle": has_vehicle,
        "drives": drives,
        "has_vehicle_or_drives": vehicle_or_drives,
        "destination_state": destination,
        "origin_state": current,
    }


def _text(value: str | bool) -> str:
    return ("true" if value else "false") if isinstance(value, bool) else value


def _test(condition: dict[str, Any], value: str | bool | None) -> str:
    """"match", "no_match" or "unknown"."""
    if value is None:
        return "unknown"
    expected = condition["value"]
    if condition["op"] == "eq":
        return "match" if type(value) is type(expected) and value == expected else "no_match"
    listed = _text(value) in expected
    if condition["op"] == "in":
        return "match" if listed else "no_match"
    return "no_match" if listed else "match"


def _fill(text: str, profile: Profile) -> str:
    current = profile.get("currentState")
    return text.replace("{destination}", state_name(profile.get("destinationState"))).replace(
        "{origin}", state_name(current) if current else "your previous state"
    )


def add_days(iso_date: str, days: int) -> str | None:
    try:
        return (date.fromisoformat(iso_date) + timedelta(days=days)).isoformat()
    except ValueError:
        return None


def _build_task(rule: Rule, profile: Profile, missing: list[str]) -> Task:
    t = rule["task_template"]
    days_after_move = (t.get("deadline") or {}).get("daysAfterMove")

    deadline = None
    if t.get("deadline"):
        deadline = {"label": _fill(t["deadline"]["label"], profile)}
        # Once the user has confirmed arrival, that date replaces the planned one.
        base = profile.get("arrivedOn") or profile.get("moveDate")
        computed = add_days(base, days_after_move) if days_after_move is not None and base else None
        if computed:
            deadline["date"] = computed

    verification_note = None
    if not rule["verified"]:
        verification_note = (
            "Civio has no verified rule for this state yet. Confirm the requirement and any deadline "
            "on the official site before acting."
        )
    elif missing:
        asks = list(dict.fromkeys(FACT_QUESTION[fact] for fact in missing))
        verification_note = f"This may apply to you. Add {' and '.join(asks)} to your profile to confirm."

    source = {"name": rule["source_name"], "url": rule["source_url"], "lastVerified": rule["last_verified"]}
    if rule.get("effective_date"):
        source["effectiveDate"] = rule["effective_date"]

    financial = t.get("financial")
    task: Task = {
        "id": rule["rule_id"],
        "ruleId": rule["rule_id"],
        "title": _fill(t["title"], profile),
        "category": t["category"],
        "priority": t["priority"],
        "description": _fill(t["description"], profile),
        "steps": [_fill(step, profile) for step in t["steps"]],
        "documents": [_fill(document, profile) for document in t["documents"]],
        "deadline": deadline,
        "financial": {**financial, "note": _fill(financial["note"], profile)} if financial else None,
        "source": source,
        "dependsOn": list(rule.get("depends_on") or []),
        "status": "needs_verification" if verification_note else "pending",
    }
    # Optional fields are left out when empty, as the browser expects.
    if days_after_move is not None:
        task["daysAfterMove"] = days_after_move
    if verification_note:
        task["verificationNote"] = verification_note
    return task


def evaluate_rule(rule: Rule, profile: Profile) -> Task | None:
    """Evaluate one rule. Returns a task, or None when the rule does not apply."""
    current = profile.get("currentState")
    destination = profile.get("destinationState")
    if current and current == destination:
        return None
    # A state-scoped rule only ever applies to a known, matching state.
    if rule["state"] != "US":
        side = current if rule.get("state_role") == "origin" else destination
        if side != rule["state"]:
            return None

    facts = derive_facts(profile)
    missing: list[str] = []
    for condition in rule["conditions"]:
        verdict = _test(condition, facts[condition["fact"]])
        if verdict == "no_match":
            return None
        if verdict == "unknown":
            missing.append(condition["fact"])
    return _build_task(rule, profile, missing)


_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def compare_tasks(a: Task, b: Task) -> int:
    """Tasks with a computed date first (soonest first), then by priority."""
    ad = (a["deadline"] or {}).get("date")
    bd = (b["deadline"] or {}).get("date")
    if ad and bd and ad != bd:
        return -1 if ad < bd else 1
    if ad and not bd:
        return -1
    if not ad and bd:
        return 1
    return _PRIORITY_RANK[a["priority"]] - _PRIORITY_RANK[b["priority"]]


def _order_by_dependencies(tasks: list[Task]) -> list[Task]:
    """Keep the deadline order, but never list a task before one it depends on."""
    by_id = {task["id"]: task for task in tasks}
    placed: set[str] = set()
    visiting: set[str] = set()
    out: list[Task] = []

    def place(task: Task) -> None:
        if task["id"] in placed or task["id"] in visiting:
            return  # a cycle in the data falls back to deadline order
        visiting.add(task["id"])
        for dependency in task["dependsOn"]:
            if dependency in by_id:
                place(by_id[dependency])
        visiting.discard(task["id"])
        placed.add(task["id"])
        out.append(task)

    for task in tasks:
        place(task)
    return out


def generate_plan(profile: Profile, rules: list[Rule] = RULES) -> list[Task]:
    tasks = [task for rule in rules if (task := evaluate_rule(rule, profile))]
    ids = {task["id"] for task in tasks}
    # A dependency that is not part of this plan does not block anything.
    for task in tasks:
        task["dependsOn"] = [dependency for dependency in task["dependsOn"] if dependency in ids]
    return _order_by_dependencies(sorted(tasks, key=cmp_to_key(compare_tasks)))
