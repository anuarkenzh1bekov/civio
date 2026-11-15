import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app import sessions
from app.main import app

from .conftest import DEMO_PROFILE

client = TestClient(app)

FORECAST = {
    "origin": "TX", "destination": "CA", "people": 2, "bedrooms": 1, "payMode": "gross",
    "pay": 85000, "filing": "single", "offer": None, "moving": "estimate",
}


def session(**changes) -> dict:
    return {"profile": DEMO_PROFILE, "done": ["US-TAX-8822"], "demo": False, "costs": {"ca-smog": 60}, "pack": False, **changes}


def test_plan_returns_the_checklist_for_a_profile():
    response = client.post("/api/plan", json={"profile": DEMO_PROFILE})
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    reg = next(task for task in tasks if task["id"] == "CA-VEH-REG")
    assert reg["deadline"]["date"] == "2027-02-04"
    assert reg["source"]["url"].startswith("https://")
    # Unknown values are absent, not null, which is how the browser tells them apart.
    assert "verificationNote" not in reg


@pytest.mark.parametrize("profile", [{"currentState": "Texas"}, {"hasVehicle": "yes"}, {"childAges": [40]}, {"moveDate": None}])
def test_plan_rejects_a_profile_that_does_not_fit(profile):
    response = client.post("/api/plan", json={"profile": profile})
    assert response.status_code == 400
    assert response.json() == {"error": "Invalid profile."}


def test_notify_list_comes_with_a_plain_text_copy():
    body = client.post("/api/documents/notify", json={"profile": DEMO_PROFILE}).json()
    assert [item["id"] for item in body["items"]][:2] == ["usps", "irs"]
    assert body["text"].startswith("Who to notify: Texas to California\n\n1. US Postal Service")


def test_rule_sources_are_listed_by_id():
    body = client.get("/api/rules/sources", params={"ids": "CA-VEH-REG,NOPE"}).json()
    assert [source["ruleId"] for source in body["sources"]] == ["CA-VEH-REG"]
    assert body["sources"][0]["url"].startswith("https://")


def test_intake_reads_text_with_built_in_rules_when_no_model_is_configured(no_ai):
    body = client.post("/api/intake", json={"text": "Moving to California from Texas. No kids, no car."}).json()
    assert body["mode"] == "rules_only"
    assert body["profile"]["destinationState"] == "CA"
    assert "notice" not in body
    assert client.post("/api/intake", json={"text": "  "}).status_code == 400


def test_intake_chat_reads_the_answer_to_the_open_question(no_ai):
    body = client.post("/api/intake/chat", json={
        "messages": [{"role": "assistant", "content": "Are you bringing a vehicle?"}, {"role": "user", "content": "nope"}],
        "profile": {"currentState": "TX", "destinationState": "CA"},
        "asking": "hasVehicle",
    }).json()
    assert body["profile"] == {"hasVehicle": False}
    assert body["found"] == [{"field": "hasVehicle", "label": "No vehicle", "value": "No vehicle", "from": "your answer"}]
    assert body["declined"] == []
    assert body["mode"] == "rules_only"


def test_intake_chat_needs_a_message_from_the_person():
    response = client.post("/api/intake/chat", json={"messages": [{"role": "assistant", "content": "Hi"}]})
    assert response.status_code == 400
    assert response.json() == {"error": "Send a message."}


def test_documents_returns_the_template_letter_when_no_model_is_configured(no_ai):
    letter = "To whom it may concern,\n\nMy address changes on Jan 15, 2027."
    body = client.post("/api/documents", json={"letter": letter}).json()
    assert body == {
        "letter": letter, "mode": "template",
        "notice": "AI tailoring is not configured here. This is the standard letter.",
    }
    assert client.post("/api/documents", json={"letter": "short"}).status_code == 400


def test_assistant_streams_source_excerpts_without_a_model(no_ai):
    response = client.post("/api/assistant", json={
        "messages": [{"role": "user", "content": "How long do I have to register my car in California?"}],
        "profile": DEMO_PROFILE,
    })
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [event["type"] for event in events] == ["sources", "text", "done"]
    assert events[0]["mode"] == "rules_only"
    assert events[0]["searchMode"] == "bm25"
    assert events[0]["sources"][0]["citation"] == "S1"
    assert events[1]["delta"].startswith("Relevant official-source excerpts")


def test_assistant_rejects_a_conversation_that_does_not_end_with_the_user():
    response = client.post("/api/assistant", json={"messages": [{"role": "assistant", "content": "Hello"}]})
    assert response.status_code == 400


def test_session_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "DATA_DIR", tmp_path)
    sid = str(uuid.uuid4())
    assert client.get(f"/api/session/{sid}").status_code == 404

    saved = session(profile={**DEMO_PROFILE, "forecast": FORECAST, "unknown": 1})
    assert client.put(f"/api/session/{sid}", json=saved).json()["ok"] is True

    response = client.get(f"/api/session/{sid}")
    assert response.headers["cache-control"] == "no-store"
    stored = response.json()["session"]
    assert "unknown" not in stored["profile"]
    # "Keep my current pay" is an answer: the null has to survive the round trip.
    assert stored["profile"]["forecast"]["offer"] is None
    assert stored["profile"]["budget"]["incomeNow"] == 5400
    assert stored["done"] == ["US-TAX-8822"]


def test_session_writes_are_validated(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "DATA_DIR", tmp_path)
    sid = str(uuid.uuid4())
    assert client.put("/api/session/not-a-uuid", json=session()).status_code == 404
    assert client.put(f"/api/session/{sid}", json=session(pack="yes")).status_code == 400
    # A forecast has to describe the same move as the profile.
    mismatched = session(profile={**DEMO_PROFILE, "forecast": {**FORECAST, "destination": "FL"}})
    assert client.put(f"/api/session/{sid}", json=mismatched).status_code == 400
    assert client.put(f"/api/session/{sid}", content="x" * 20_001).status_code == 413


def test_sessions_saved_by_the_node_server_are_still_readable(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "DATA_DIR", tmp_path)
    sid = str(uuid.uuid4())
    (tmp_path / "sessions").mkdir()
    (tmp_path / "sessions" / f"{sid}.json").write_text(
        json.dumps({"data": json.dumps(session()), "updatedAt": 1}), encoding="utf-8"
    )
    assert client.get(f"/api/session/{sid}").json()["updatedAt"] == 1
