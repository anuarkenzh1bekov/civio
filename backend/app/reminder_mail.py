import hashlib
import json
import os
from datetime import date
from html import escape
from typing import Literal

import httpx

from app.config import DATA_DIR


def mode() -> Literal["resend", "outbox", "off"]:
    if os.getenv("RESEND_API_KEY") and os.getenv("MAIL_FROM"):
        return "resend"
    return "off" if os.getenv("NODE_ENV") == "production" or os.getenv("K_SERVICE") else "outbox"


def confirmation(confirm: str, unsubscribe: str) -> dict[str, str]:
    title = "Confirm your Civio deadline reminders"
    intro = "Someone asked for emails about the deadlines in a Civio moving plan to be sent to this address."
    notice = "If it was not you, ignore this message and nothing will be sent."
    return {
        "subject": title,
        "text": f"{title}.\n\n{intro}\nIf that was you, confirm here: {confirm}\n\n{notice}\nUnsubscribe: {unsubscribe}",
        "html": (f"<h1>{title}</h1><p>{intro}</p><p><a href=\"{escape(confirm)}\">Confirm reminders</a></p>"
                 f"<p>{notice}</p><p><a href=\"{escape(unsubscribe)}\">Unsubscribe</a></p>"),
    }


def when(days: int) -> str:
    if days < 0:
        return "1 day overdue" if days == -1 else f"{-days} days overdue"
    if days < 2:
        return ("today", "tomorrow")[days]
    return f"in {days} days"


def digest(items: list[dict], plan: str, unsubscribe: str) -> dict[str, str]:
    first = items[0]
    subject = f"Civio: {len(items)} deadlines need your attention"
    if len(items) == 1:
        timing = "overdue" if first["daysLeft"] < 0 else f"due {when(first['daysLeft'])}"
        subject = f'Civio: "{first["title"]}" is {timing}'
    text = ["Deadlines from your Civio plan:", ""]
    rows = []
    for item in items:
        day = date.fromisoformat(item["dueDate"])
        timing = f"{day:%b} {day.day}, {day.year} ({when(item['daysLeft'])})"
        title, name, url = item["title"], item["sourceName"], item["sourceUrl"]
        text.append(f"- {title}: {timing}\n  Official source: {name} {url}")
        rows.append(f'<li><strong>{escape(title)}</strong><br>{timing}<br><a href="{escape(url)}">{escape(name)}</a></li>')
    notice = "You get this because you turned on deadline reminders. Dates come from the rules in your plan."
    text.extend(["", f"Open your plan: {plan}", "", notice, f"Unsubscribe: {unsubscribe}"])
    return {
        "subject": subject, "text": "\n".join(text),
        "html": ("<h1>Deadlines from your plan</h1><ul>" + "".join(rows) + "</ul>"
                 f'<p><a href="{escape(plan)}">Open your plan</a></p><p>{notice} '
                 f'<a href="{escape(unsubscribe)}">Unsubscribe</a></p>'),
    }


def send(to: str, message: dict[str, str], unsubscribe: str, delivery_id: str) -> bool:
    delivery_mode = mode()
    key = hashlib.sha256(delivery_id.encode()).hexdigest()
    if delivery_mode == "outbox":
        outbox = DATA_DIR / "outbox"
        try:
            outbox.mkdir(parents=True, exist_ok=True)
            with (outbox / f"{key}.json").open("x", encoding="utf-8") as file:
                json.dump({"to": to, **message, "unsubscribeUrl": unsubscribe}, file, ensure_ascii=False)
        except FileExistsError:
            pass  # Another invocation already delivered this message to the local outbox.
        except OSError:
            return False
        return True
    if delivery_mode == "off":
        return False
    try:
        response = httpx.post(
            "https://api.resend.com/emails", timeout=15,
            headers={"Authorization": "Bearer " + os.environ["RESEND_API_KEY"], "Idempotency-Key": key},
            json={"from": os.environ["MAIL_FROM"], "to": [to], **message, "headers": {
                "List-Unsubscribe": f"<{unsubscribe}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }},
        )
        return response.is_success
    except httpx.HTTPError:
        return False
