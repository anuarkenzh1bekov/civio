import asyncio
import json
import re
from typing import Any, AsyncIterator

import anthropic
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.config import ANTHROPIC_MODEL, ai_provider
from app.llm.gemini import gemini_text
from app.rag import RAG_SYSTEM_PROMPT, evidence_context, evidence_fallback, retrieve_evidence
from app.routers.common import error, read_body, text_of
from app.rules.engine import generate_plan
from app.schemas import AssistantBody
from app.states import state_name

router = APIRouter(prefix="/api")

_LABELS = {
    "employment": {"employee": "Employee", "self_employed": "Self-employed", "unemployed": "Unemployed"},
    "income": {"w2": "W-2", "1099": "1099", "both": "W-2 and 1099", "none": "None"},
    "insurance": {
        "employer": "Employer plan", "marketplace": "Marketplace plan", "medicaid": "Medicaid",
        "other": "Other", "none": "None",
    },
}
_CITATION = re.compile(r"\[S(\d+)\]")
_URL = re.compile(r"https?://", re.IGNORECASE)
_REFUSAL = re.compile(
    r"does not (contain|cover)|doesn't (contain|cover)|not covered|no (relevant|sufficient)"
    r"|не (содерж|охват)|недостаточно|нет (информации|сведений)",
    re.IGNORECASE,
)


def render_profile(profile: dict[str, Any]) -> str:
    def yes_no(value: bool | None) -> str:
        return "not answered" if value is None else "yes" if value else "no"

    def pick(group: str, value: str | None) -> str:
        return _LABELS[group].get(value, value) if value else "not answered"

    current = profile.get("currentState")
    destination = profile.get("destinationState")
    ages = profile.get("childAges")
    return "\n".join([
        f"Moving from: {state_name(current) if current else 'not answered'}",
        f"Moving to: {state_name(destination) if destination else 'not answered'}",
        f"Planned move date: {profile.get('moveDate') or 'not answered'}",
        f"Employment: {pick('employment', profile.get('employment'))}",
        f"Income type: {pick('income', profile.get('income'))}",
        f"Marital status: {profile.get('marital') or 'not answered'}",
        f"Children: {yes_no(profile.get('hasChildren'))}{f' (ages {', '.join(map(str, ages))})' if ages else ''}",
        f"Health insurance: {pick('insurance', profile.get('insurance'))}",
        f"Bringing a vehicle: {yes_no(profile.get('hasVehicle'))}",
        f"Will drive after moving: {yes_no(profile.get('drives'))}",
    ])


async def _generate(provider: str, history: list[dict[str, str]], context: str) -> str:
    if provider == "google":
        contents = [
            {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
            for m in history
        ]
        return await gemini_text(RAG_SYSTEM_PROMPT, [*contents, {"role": "user", "parts": [{"text": context}]}])
    response = await anthropic.AsyncAnthropic().messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=2000,
        system=RAG_SYSTEM_PROMPT,
        messages=[*history, {"role": "user", "content": context}],
    )
    return text_of(response)


def _check(generated: str, source_count: int) -> None:
    """An answer is only shown when every citation points at a retrieved passage."""
    citations = [int(n) for n in _CITATION.findall(generated)]
    if not generated.strip() or any(n < 1 or n > source_count for n in citations) or _URL.search(generated):
        raise ValueError("Invalid answer sources")
    if not citations and not _REFUSAL.search(generated):
        raise ValueError("Missing evidence citations")


@router.post("/assistant")
async def assistant(request: Request):
    """Answer a question from the retrieved official-source passages, as a stream of JSON lines."""
    body = await read_body(request, AssistantBody)
    if not body or body.messages[-1].role != "user":
        return error("Invalid request.")
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    profile = body.profile.to_dict() if body.profile else None
    question = messages[-1]["content"]

    async def stream() -> AsyncIterator[str]:
        def event(**fields: Any) -> str:
            return json.dumps({k: v for k, v in fields.items() if v is not None}, ensure_ascii=False) + "\n"

        try:
            result = await retrieve_evidence(question, profile)
            hits, search_mode, notice = result["hits"], result["mode"], result.get("notice")
            sources = [
                {
                    "ruleId": hit["chunk"]["id"], "citation": f"S{i}", "name": hit["chunk"]["title"],
                    "url": hit["chunk"]["url"], "lastVerified": "", "verified": False,
                    "retrievedAt": hit["chunk"]["retrievedAt"], "kind": hit["chunk"]["kind"],
                }
                for i, hit in enumerate(hits, start=1)
            ]
            provider = ai_provider()
            can_generate = provider is not None and len(hits) > 0
            yield event(type="sources", sources=sources, mode="ai" if can_generate else "rules_only",
                        searchMode=search_mode, notice=notice)
            answer = evidence_fallback(hits)
            if can_generate:
                plan = []
                for task in generate_plan(profile) if profile else []:
                    item = {"title": task["title"], "status": task["status"]}
                    if (task["deadline"] or {}).get("date"):
                        item["date"] = task["deadline"]["date"]
                    plan.append(item)
                context = json.dumps({
                    "evidence": evidence_context(hits),
                    "profile": render_profile(profile) if profile else "Not shared",
                    "deterministicPlan": plan,
                    "question": question,
                }, separators=(",", ":"), ensure_ascii=False)
                try:
                    async with asyncio.timeout(30):
                        generated = await _generate(provider, messages[:-1], context)
                    _check(generated, len(sources))
                    answer = generated
                except Exception:
                    yield event(
                        type="sources", sources=sources, mode="rules_only", searchMode=search_mode,
                        notice=" ".join(filter(None, [notice, "AI answer unavailable; showing the retrieved source text."])),
                    )
            yield event(type="text", delta=answer)
            yield event(type="done")
        except Exception:
            yield event(type="error", message="The assistant could not load its sources. Your plan is unchanged.")
            yield event(type="done")

    return StreamingResponse(
        stream(), media_type="application/x-ndjson; charset=utf-8", headers={"Cache-Control": "no-store"}
    )
