"""The paths that use a model, with the model's reply stubbed."""

import json

import pytest
from fastapi.testclient import TestClient

from app.llm.gemini import GeminiError
from app.main import app
from app.routers import assistant, intake

from .conftest import DEMO_PROFILE

client = TestClient(app)

EXTRACTION = {
    "currentState": "Texas", "destinationState": "CA", "moveDate": None, "zip": None, "employment": None,
    "income": None, "marital": None, "hasChildren": True, "childAges": [4, 9], "insurance": None,
    "hasVehicle": None, "drives": None, "vehicleRegisteredInCurrentState": None,
    "evidence": [{"field": "childAges", "quote": "two kids, 4 and 9"}],
}
QUESTION = {
    "messages": [{"role": "user", "content": "How long do I have to register my car in California?"}],
    "profile": DEMO_PROFILE,
}


@pytest.fixture
def gemini(monkeypatch):
    """Google is the configured provider and replies with whatever the test sets."""
    monkeypatch.setenv("GOOGLE_API_KEY", "test")
    reply: dict = {}

    async def fake(system, contents, **options):
        reply["contents"] = contents
        if isinstance(reply["value"], Exception):
            raise reply["value"]
        return reply["value"]

    async def no_embeddings(*args, **kwargs):
        raise RuntimeError("no network in tests")

    monkeypatch.setattr(intake, "gemini_text", fake)
    monkeypatch.setattr(assistant, "gemini_text", fake)
    monkeypatch.setattr("app.rag.retrieve.embed_texts", no_embeddings)
    return reply


def events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines()]


def test_intake_uses_the_models_reading(gemini):
    gemini["value"] = json.dumps(EXTRACTION)
    body = client.post("/api/intake", json={"text": "From Texas to CA with two kids, 4 and 9"}).json()
    assert body["mode"] == "ai"
    assert body["profile"] == {"currentState": "TX", "destinationState": "CA", "hasChildren": True, "childAges": [4, 9]}
    assert {"field": "childAges", "label": "Children's ages", "value": "4, 9", "from": "two kids, 4 and 9"} in body["found"]


@pytest.mark.parametrize(("reply", "notice"), [
    ("{}", "The AI model's answer could not be used. The text was read with built-in rules instead."),
    ("not json", "The AI model could not read this. The text was read with built-in rules instead."),
    (GeminiError("rate_limit", 429), "The AI model is busy. The text was read with built-in rules instead."),
    (GeminiError("auth", 403), "The AI model's API key was rejected. The text was read with built-in rules instead."),
])
def test_intake_falls_back_to_rules_when_the_model_fails(gemini, reply, notice):
    gemini["value"] = reply
    body = client.post("/api/intake", json={"text": "Moving to California from Texas."}).json()
    assert body["mode"] == "rules_only"
    assert body["notice"] == notice
    assert body["profile"] == {"currentState": "TX", "destinationState": "CA"}


def test_intake_chat_keeps_only_real_fields_as_declined(gemini):
    gemini["value"] = json.dumps({**EXTRACTION, "declined": ["moveDate", "favouriteColour"]})
    body = client.post("/api/intake/chat", json={
        "messages": [{"role": "user", "content": "not sure about the date"}], "asking": "moveDate",
    }).json()
    assert body["mode"] == "ai"
    assert body["declined"] == ["moveDate"]
    assert "Profile so far: {}" in gemini["contents"][0]["parts"][0]["text"]


def test_assistant_shows_an_answer_that_cites_its_sources(gemini):
    gemini["value"] = "You have **20 days** after becoming a resident [S1]."
    stream = events(client.post("/api/assistant", json=QUESTION))
    assert [event["type"] for event in stream] == ["sources", "text", "done"]
    assert stream[0]["mode"] == "ai"
    assert stream[1]["delta"] == gemini["value"]
    # The model sees the retrieved passages and the deterministic plan, not the raw question alone.
    context = json.loads(gemini["contents"][-1]["parts"][0]["text"])
    assert context["question"] == QUESTION["messages"][0]["content"]
    assert any(task["title"] and task["status"] for task in context["deterministicPlan"])


@pytest.mark.parametrize("answer", [
    "You have 20 days.",  # no citation
    "See [S99] for details.",  # a source that was not retrieved
    "Read https://example.com [S1].",  # a link the app did not supply
    "",
])
def test_assistant_falls_back_to_source_text_when_the_answer_cannot_be_trusted(gemini, answer):
    gemini["value"] = answer
    stream = events(client.post("/api/assistant", json=QUESTION))
    assert [event["type"] for event in stream] == ["sources", "sources", "text", "done"]
    assert stream[1]["mode"] == "rules_only"
    assert stream[1]["notice"].endswith("AI answer unavailable; showing the retrieved source text.")
    assert stream[2]["delta"].startswith("Relevant official-source excerpts")


def test_assistant_accepts_an_uncited_answer_that_says_the_sources_do_not_cover_it(gemini):
    gemini["value"] = "The collection does not cover that question."
    assert events(client.post("/api/assistant", json=QUESTION))[1]["delta"] == gemini["value"]
