import hmac
import os
import re
import secrets
import time
from datetime import date

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

from app import config, reminder_mail, reminder_store, reminders, sessions
from app.routers.common import error, read_body
from app.schemas import Model

router = APIRouter(prefix="/api/reminders")
NO_STORE = {"Cache-Control": "no-store"}
EMAIL = re.compile(r"^(?!\.)(?!.*\.\.)[a-z0-9_'+.\-]*[a-z0-9_+\-]@(?:[a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$", re.I)


class Subscribe(Model):
    sid: str
    email: str
    consent: bool


class BySession(Model):
    sid: str


def origin(request: Request) -> str:
    return (os.getenv("APP_URL", "").strip() or str(request.base_url)).rstrip("/")


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def status(record=None, confirm_url: str | None = None):
    mode = reminder_mail.mode()
    data = {"mode": mode, "status": "none"}
    if record and record["status"] in ("confirmed", "pending"):
        email = record["email"]
        data.update(status=record["status"], email=f"{email[:1]}***@{email.partition('@')[2]}")
    if confirm_url and mode == "outbox":
        data["devConfirmUrl"] = confirm_url
    return JSONResponse(data, headers=NO_STORE)


@router.get("")
def get_status(sid: str = ""):
    return status(reminder_store.get(sid) if sessions.is_session_id(sid) else None)


def subscribe(sid: str, email: str, public_origin: str):
    if not sessions.is_session_id(sid) or not sessions.get(sid):
        return error("Open your plan first, then turn reminders on.", 404)
    if reminder_mail.mode() == "off":
        return error("Email is not set up on this server.", 503)
    previous = reminder_store.get(sid)
    if previous and previous["status"] == "confirmed" and previous["email"] == email:
        return status(previous)
    now = now_ms()
    wait = "A confirmation email was just sent. Wait a minute before asking again."
    if previous and now - previous["confirmSentAt"] < 60_000:
        return error(wait, 429)
    token = secrets.token_urlsafe(24)
    record = reminder_store.Subscription(
        sid=sid, email=email, status="pending", token=token, confirmSentAt=now,
        createdAt=previous["createdAt"] if previous else now, sent=previous["sent"] if previous else [],
    )
    if not reminder_store.replace(sid, previous, record):
        return error(wait, 429)
    confirm_url = f"{public_origin}/api/reminders/confirm?token={token}"
    unsubscribe_url = reminders.unsubscribe_link(public_origin, token)
    message = reminder_mail.confirmation(confirm_url, unsubscribe_url)
    if not reminder_mail.send(email, message, unsubscribe_url, token):
        reminder_store.replace(sid, record, previous)
        return error("The confirmation email could not be sent. Try again later.", 502)
    return status(record, confirm_url)


@router.post("")
async def turn_on(request: Request):
    body = await read_body(request, Subscribe)
    email = body.email.strip().lower() if body else ""
    if not body or not body.consent or len(email) > 254 or not EMAIL.fullmatch(email):
        return error("Enter a valid email and tick the box to agree.")
    return await run_in_threadpool(subscribe, body.sid, email, origin(request))


def page(title: str, message: str, code: int = 200):
    return HTMLResponse(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{title}</title></head><body style="font:1rem system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem">'
        f'<h1>{title}</h1><p>{message}</p></body></html>', status_code=code, headers=NO_STORE,
    )


@router.get("/confirm")
def confirm(request: Request, token: str = ""):
    record = reminder_store.by_token(token)
    while record and record["email"] and record["status"] != "unsubscribed":
        sid = record["sid"]
        if record["status"] == "confirmed" or reminder_store.replace(
            sid, record, {**record, "status": "confirmed", "confirmedAt": now_ms()}
        ):
            return RedirectResponse(f"{origin(request)}/dashboard?s={sid}&reminders=confirmed", 302, headers=NO_STORE)
        record = reminder_store.by_token(token)
    return page("This link is no longer valid", "Turn reminders on again from your plan to get a new confirmation email.", 404)


def unsubscribe(token: str, sid: str = "") -> bool:
    if len(token) < 16 and not sessions.is_session_id(sid):
        return False
    while True:
        record = reminder_store.by_token(token) if len(token) >= 16 else reminder_store.get(sid)
        if not record:
            return False
        if record["status"] == "unsubscribed" or reminder_store.replace(
            record["sid"], record, {**record, "status": "unsubscribed", "email": ""}
        ):
            return True


@router.get("/unsubscribe")
def unsubscribe_link(token: str = ""):
    if unsubscribe(token):
        return page("You are unsubscribed", "Civio will not email you about deadlines. You can turn reminders on again from your plan.")
    return page("This link is no longer valid", "Nothing is scheduled for this address.", 404)


@router.post("/unsubscribe")
async def turn_off(request: Request, token: str = ""):
    body = await read_body(request, BySession) if not token else None
    ok = await run_in_threadpool(unsubscribe, token, body.sid if body else "")
    return JSONResponse({"ok": ok}, status_code=200 if ok else 404, headers=NO_STORE)


@router.api_route("/run", methods=["GET", "POST"], include_in_schema=False)
def run(request: Request, dry: str = ""):
    secret = os.getenv("CRON_SECRET")
    if not secret:
        return error("Reminders are not scheduled on this server.", 503)
    if not hmac.compare_digest(request.headers.get("authorization", "").encode(), f"Bearer {secret}".encode()):
        return error("Unauthorized.", 401)
    result = reminders.run(date.fromisoformat(config.today()), origin(request), dry=dry == "1")
    return JSONResponse(result, headers=NO_STORE)
