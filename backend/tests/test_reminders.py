import json
from datetime import date
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import config, reminder_mail, reminder_store, reminders, sessions
from app.main import app
from tests.conftest import DEMO_PROFILE

client = TestClient(app)
RUN = "/api/reminders/run"
AUTH = {"Authorization": "Bearer test-scheduler"}


@pytest.fixture(autouse=True)
def local_outbox(monkeypatch, tmp_path):
    for var in ("STORE", "K_SERVICE", "NODE_ENV", "RESEND_API_KEY", "MAIL_FROM", "APP_URL"):
        monkeypatch.delenv(var, raising=False)
    for module in (sessions, reminder_store, reminder_mail):
        monkeypatch.setattr(module, "DATA_DIR", tmp_path)
    monkeypatch.setenv("CRON_SECRET", "test-scheduler")
    monkeypatch.setattr(config, "today", lambda: "2027-02-01")


@pytest.fixture
def sid():
    key = str(uuid4())
    plan = {"profile": DEMO_PROFILE, "costs": {}, "done": [], "pack": False, "demo": False}
    assert client.put(f"/api/session/{key}", json=plan).is_success
    return key


def subscribe(sid, **changes):
    return client.post("/api/reminders", json={"sid": sid, "email": "Jordan@example.com", "consent": True, **changes})


def test_subscription_from_signup_through_one_click_unsubscribe(sid, tmp_path):
    signup = subscribe(sid).json()
    assert (signup["status"], signup["email"], signup["mode"]) == ("pending", "j***@example.com", "outbox")
    link = urlsplit(signup["devConfirmUrl"])
    token = parse_qs(link.query)["token"][0]
    assert len(list((tmp_path / "outbox").iterdir())) == 1
    assert subscribe(sid).status_code == 429
    assert client.get(RUN, headers=AUTH).json()["checked"] == 0

    confirmed = client.get(link.geturl(), follow_redirects=False)
    assert confirmed.status_code == 302
    assert confirmed.headers["location"].endswith(f"/dashboard?s={sid}&reminders=confirmed")
    assert client.get("/api/reminders", params={"sid": sid}).json()["status"] == "confirmed"
    assert subscribe(sid).json()["email"] == "j***@example.com"
    preview = client.get(RUN, params={"dry": 1}, headers=AUTH).json()
    assert any(i["taskId"] == "CA-VEH-REG" for i in preview["preview"][0]["items"])
    assert "example.com" not in json.dumps(preview)
    assert len(list((tmp_path / "outbox").iterdir())) == 1

    assert client.post(RUN, headers=AUTH).json() == {"checked": 1, "emailed": 1, "failed": 0}
    assert client.get(RUN, headers=AUTH).json()["emailed"] == 0
    messages = [json.loads(p.read_text(encoding="utf-8")) for p in (tmp_path / "outbox").iterdir()]
    digest = next(mail for mail in messages if "Deadlines from your Civio plan:" in mail["text"])
    assert f"/dashboard?s={sid}" in digest["text"] and token in digest["unsubscribeUrl"]
    assert "Official source:" in digest["text"]
    assert client.post(digest["unsubscribeUrl"], content="List-Unsubscribe=One-Click").json() == {"ok": True}
    assert client.get(link.geturl(), follow_redirects=False).status_code == 404
    assert reminder_store.get(sid)["email"] == ""
    assert client.get(RUN, headers=AUTH).json()["checked"] == 0


def test_consent_scheduler_auth_and_disabled_mail(sid, monkeypatch):
    assert subscribe(sid, consent=False).status_code == 400
    assert subscribe(sid, email="invalid").status_code == 400
    assert subscribe(str(uuid4())).status_code == 404
    assert client.get(RUN).status_code == 401
    monkeypatch.delenv("CRON_SECRET")
    assert client.get(RUN, headers=AUTH).status_code == 503
    monkeypatch.setenv("NODE_ENV", "production")
    assert subscribe(sid).status_code == 503
    assert client.get("/api/reminders", params={"sid": sid}).json() == {"mode": "off", "status": "none"}


def test_failed_delivery_is_retriable(sid, monkeypatch):
    with monkeypatch.context() as patch:
        patch.setattr(reminder_mail, "send", lambda *args: False)
        assert subscribe(sid).status_code == 502
    assert reminder_store.get(sid) is None
    client.get(subscribe(sid).json()["devConfirmUrl"], follow_redirects=False)
    with monkeypatch.context() as patch:
        patch.setattr(reminder_mail, "send", lambda *args: False)
        assert client.get(RUN, headers=AUTH).json() == {"checked": 1, "emailed": 0, "failed": 1}
    assert reminder_store.get(sid)["sent"] == []
    assert client.get(RUN, headers=AUTH).json()["emailed"] == 1
    assert client.post("/api/reminders/unsubscribe", json={"sid": sid}).json() == {"ok": True}


def test_milestones_and_overdue_digest():
    task = {"id": "car", "title": "Register <your> car", "deadline": {"date": "2027-02-10"},
            "source": {"name": "Official source", "url": "https://example.gov"}}

    def due(day, done=(), sent=()):
        return reminders.due_reminders([task], done, sent, date.fromisoformat(day))

    assert due("2027-02-02") == ([], [])
    items, marks = due("2027-02-08")
    assert len(items) == 1 and set(marks) == {"car:7", "car:3"}
    assert due("2027-02-08", sent=marks) == ([], [])
    last, _ = due("2027-02-09", sent=marks)
    digest = reminder_mail.digest(last, "https://civio.test/plan", "https://civio.test/unsubscribe")
    assert digest["subject"] == 'Civio: "Register <your> car" is due tomorrow'
    assert "Register &lt;your&gt; car" in digest["html"]
    assert due("2027-02-09", done=["car"]) == ([], [])
    late, late_marks = due("2027-02-15")
    assert late[0]["daysLeft"] == -5 and "car:overdue" in late_marks
    assert due("2027-02-16", sent=late_marks) == ([], [])
    assert due("2027-04-10") == ([], [])
    assert reminders.due_reminders([{**task, "deadline": None}], [], [], date.today()) == ([], [])


def test_existing_json_subscriptions_and_stale_updates(tmp_path, sid):
    record = {"sid": sid, "token": "t" * 32, "email": "legacy@example.com", "status": "confirmed",
              "createdAt": 1, "confirmedAt": 2, "confirmSentAt": 1, "sent": ["car:7"]}
    (tmp_path / "reminders.json").write_text(json.dumps([record]), encoding="utf-8")
    assert reminder_store.by_token(record["token"]) == record
    assert client.post("/api/reminders/unsubscribe", json={"sid": sid}).json()["ok"]
    assert not reminder_store.replace(sid, record, {**record, "sent": ["car:3", "car:7"]})
    assert reminder_store.get(sid)["status"] == "unsubscribed"
