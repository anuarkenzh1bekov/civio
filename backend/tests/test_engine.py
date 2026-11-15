import re

import pytest

from app.documents import build_notify_list
from app.rules.engine import RULES, generate_plan

from .conftest import DEMO_PROFILE, without


def ids(profile: dict) -> list[str]:
    return [task["id"] for task in generate_plan(profile)]


def find(plan: list[dict], task_id: str) -> dict | None:
    return next((task for task in plan if task["id"] == task_id), None)


def test_every_rule_carries_a_source_and_a_verification_date():
    for rule in RULES:
        assert rule["source_url"].startswith("https://"), rule["rule_id"]
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", rule["last_verified"]), rule["rule_id"]
    assert len({rule["rule_id"] for rule in RULES}) == len(RULES)


def test_builds_the_texas_to_california_demo_plan():
    plan = ids(DEMO_PROFILE)
    assert {
        "CA-VEH-REG", "CA-VEH-DL", "CA-VEH-INSURANCE", "CA-HEALTH-COVEREDCA", "CA-FAM-SCHOOL",
        "CA-TAX-540NR-IN", "CA-TAX-DE4", "US-TAX-1040ES", "US-TAX-8822",
    } <= set(plan)
    assert "TX-VEH-REG" not in plan
    assert "US-VEH-STATE-CHECK" not in plan


def test_computes_deadlines_only_from_rule_data_and_the_move_date():
    reg = find(generate_plan(DEMO_PROFILE), "CA-VEH-REG")
    assert DEMO_PROFILE["moveDate"] == "2027-01-15"
    assert reg["deadline"]["date"] == "2027-02-04"

    no_date = generate_plan(without(DEMO_PROFILE, "moveDate"))
    assert find(no_date, "CA-VEH-REG")["deadline"] == {
        "label": "Within 20 days of establishing residency or accepting employment in California",
    }


def test_drops_education_tasks_when_there_are_no_children():
    assert "CA-FAM-SCHOOL" not in ids({**DEMO_PROFILE, "hasChildren": False, "childAges": []})


def test_keeps_the_license_task_for_a_driver_without_a_vehicle():
    plan = ids({**DEMO_PROFILE, "hasVehicle": False, "drives": True})
    # The proof-of-address task is a prerequisite of the license, so it comes with it.
    assert [i for i in plan if "VEH" in i] == ["CA-VEH-RESIDENCY", "CA-VEH-DL"]


@pytest.mark.parametrize(("state", "expected"), [
    ("FL", ["FL-VEH-INSURANCE", "FL-VEH-REG", "FL-VEH-DL"]),
    ("WA", ["WA-VEH-INSURANCE", "WA-VEH-REG", "WA-VEH-DL"]),
    ("NY", ["NY-VEH-REG", "NY-VEH-DL"]),
])
def test_has_verified_vehicle_rules_and_no_generic_dmv_lookup(state, expected):
    plan = ids({**DEMO_PROFILE, "destinationState": state, "hasVehicle": True, "drives": True})
    assert [i for i in plan if i.startswith(f"{state}-VEH")] == expected
    assert "US-VEH-STATE-CHECK" not in plan


def test_provides_a_dmv_lookup_for_a_driver_moving_to_an_uncovered_state_without_a_car():
    assert "US-VEH-STATE-CHECK" in ids({**DEMO_PROFILE, "destinationState": "OR", "hasVehicle": False})


def test_does_not_create_interstate_tasks_for_the_same_state():
    assert ids({**DEMO_PROFILE, "destinationState": "TX"}) == []


def test_marks_a_task_as_needs_verification_when_a_required_answer_was_skipped():
    reg = find(generate_plan(without(DEMO_PROFILE, "hasVehicle")), "CA-VEH-REG")
    assert reg["status"] == "needs_verification"
    assert "whether you own a vehicle" in reg["verificationNote"]


def test_asks_for_childrens_ages_instead_of_guessing():
    plan = generate_plan({**DEMO_PROFILE, "childAges": []})
    assert find(plan, "CA-FAM-SCHOOL")["status"] == "needs_verification"


def test_falls_back_to_a_needs_verification_task_for_states_without_verified_rules():
    check = find(generate_plan({**DEMO_PROFILE, "destinationState": "OR"}), "US-VEH-STATE-CHECK")
    assert check["status"] == "needs_verification"
    assert "Oregon" in check["title"]
    assert check["deadline"] is None


def test_returns_nothing_state_specific_when_the_destination_is_unknown():
    assert not any(i.startswith(("CA-", "TX-")) for i in ids({"hasVehicle": True}))


# ── Plan dependencies ──

def test_lists_a_task_after_the_tasks_it_depends_on():
    plan = ids(DEMO_PROFILE)
    assert plan.index("CA-VEH-RESIDENCY") < plan.index("CA-VEH-DL")
    assert plan.index("CA-VEH-INSURANCE") < plan.index("CA-VEH-REG")


def test_every_dependency_points_at_a_real_rule_and_stays_inside_the_plan():
    known = {rule["rule_id"] for rule in RULES}
    for rule in RULES:
        for dependency in rule.get("depends_on", []):
            assert dependency in known, f"{rule['rule_id']} → {dependency}"
    plan = generate_plan(DEMO_PROFILE)
    in_plan = {task["id"] for task in plan}
    for task in plan:
        assert set(task["dependsOn"]) <= in_plan


def test_counts_deadlines_from_the_arrival_date_once_it_is_confirmed():
    arrived = generate_plan({**DEMO_PROFILE, "arrivedOn": "2027-01-20"})
    assert find(arrived, "CA-VEH-DL")["deadline"]["date"] == "2027-01-30"


# ── Who to notify ──

def test_builds_the_notify_list_from_the_profile():
    plan = generate_plan(DEMO_PROFILE)
    listed = {item["id"] for item in build_notify_list(DEMO_PROFILE, plan)}
    assert {"usps", "irs", "auto-insurer", "dmv", "school", "bank"} <= listed
    without_car_or_kids = {
        item["id"] for item in build_notify_list({**DEMO_PROFILE, "hasVehicle": False, "hasChildren": False}, plan)
    }
    assert "auto-insurer" not in without_car_or_kids
    assert "school" not in without_car_or_kids
