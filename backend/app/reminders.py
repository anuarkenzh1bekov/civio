"""Schedule mail from the same rule engine that computes the user's checklist."""

import json
from datetime import date

from app import reminder_mail, reminder_store, sessions
from app.rules.engine import generate_plan

LEAD_DAYS = (1, 3, 7)


def due_reminders(tasks: list[dict], done: list[str], sent: list[str], today: date):
    finished, already_sent = set(done), set(sent)
    items, marks = [], []
    for task in tasks:
        task_id = task["id"]
        due = (task.get("deadline") or {}).get("date")
        if not due or task_id in finished:
            continue
        days = (date.fromisoformat(due) - today).days
        if not -30 <= days <= LEAD_DAYS[-1]:
            continue
        milestones = [f"{task_id}:{lead}" for lead in LEAD_DAYS if days <= lead]
        if days < 0:
            milestones.insert(0, f"{task_id}:overdue")
        if milestones[0] in already_sent:
            continue
        items.append({"taskId": task_id, "title": task["title"], "dueDate": due, "daysLeft": days,
                      "sourceName": task["source"]["name"], "sourceUrl": task["source"]["url"]})
        marks.extend(milestones)
    return sorted(items, key=lambda item: item["daysLeft"]), marks


def unsubscribe_link(origin: str, token: str) -> str:
    return f"{origin}/api/reminders/unsubscribe?token={token}"


def run(today: date, origin: str, dry: bool = False) -> dict:
    result = {"checked": 0, "emailed": 0, "failed": 0}
    if dry:
        result["preview"] = []
    for record in reminder_store.confirmed():
        if not record["email"]:
            continue
        result["checked"] += 1
        sid, token = record["sid"], record["token"]
        row = sessions.get(sid)
        if not row:
            continue
        session = json.loads(row[0])
        items, marks = due_reminders(generate_plan(session["profile"]), session["done"], record["sent"], today)
        if not items:
            continue
        if dry:
            result["preview"].append({"sid": sid, "items": [
                {key: item[key] for key in ("taskId", "title", "dueDate", "daysLeft")} for item in items
            ]})
            continue
        unsubscribe = unsubscribe_link(origin, token)
        message = reminder_mail.digest(items, f"{origin}/dashboard?s={sid}", unsubscribe)
        delivered = reminder_mail.send(record["email"], message, unsubscribe, token + ":" + ",".join(sorted(marks)))
        if delivered:
            current = record
            while current and current["token"] == token and current["status"] == "confirmed":
                updated = {**current, "sent": sorted(set(current["sent"]).union(marks))}
                if reminder_store.replace(sid, current, updated):
                    break
                current = reminder_store.get(sid)
            result["emailed"] += 1
        else:
            result["failed"] += 1
    return result
