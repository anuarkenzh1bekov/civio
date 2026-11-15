from fastapi import APIRouter, Request

from app.documents import build_notify_list, notify_list_text
from app.routers.common import error, read_body
from app.rules.engine import RULES, generate_plan
from app.schemas import ProfileBody

router = APIRouter(prefix="/api")


@router.post("/plan")
async def plan(request: Request):
    """The checklist for a profile: which rules apply, with deadlines and sources."""
    body = await read_body(request, ProfileBody)
    if not body:
        return error("Invalid profile.")
    return {"tasks": generate_plan(body.profile.to_dict())}


@router.post("/documents/notify")
async def notify(request: Request):
    """Who to tell about the move, as a list and as plain text for copying."""
    body = await read_body(request, ProfileBody)
    if not body:
        return error("Invalid profile.")
    profile = body.profile.to_dict()
    items = build_notify_list(profile, generate_plan(profile))
    return {"items": items, "text": notify_list_text(items, profile)}


@router.get("/rules/sources")
async def sources(ids: str = ""):
    """Official sources behind the given rules, in the order the rules are kept."""
    wanted = set(ids.split(","))
    return {
        "sources": [
            {
                "ruleId": rule["rule_id"],
                "name": rule["source_name"],
                "url": rule["source_url"],
                "lastVerified": rule["last_verified"],
            }
            for rule in RULES
            if rule["rule_id"] in wanted
        ]
    }
