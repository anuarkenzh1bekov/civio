import json
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app import sessions
from app.routers.common import error
from app.schemas import Session

router = APIRouter(prefix="/api/session")


@router.get("/{session_id}")
def read(session_id: str):
    row = sessions.get(session_id) if sessions.is_session_id(session_id) else None
    if not row:
        return error("Not found.", 404)
    data, updated_at = row
    return JSONResponse(
        {"session": json.loads(data), "updatedAt": updated_at}, headers={"Cache-Control": "no-store"}
    )


@router.put("/{session_id}")
async def write(session_id: str, request: Request):
    if not sessions.is_session_id(session_id):
        return error("Not found.", 404)
    raw = (await request.body()).decode("utf-8", errors="replace")
    if len(raw) > 20_000:
        return error("Too large.", 413)
    try:
        session = Session.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        return error("Invalid session.")
    updated_at = int(time.time() * 1000)
    await run_in_threadpool(sessions.put, session_id, json.dumps(session.to_dict(), ensure_ascii=False), updated_at)
    return {"ok": True, "updatedAt": updated_at}
