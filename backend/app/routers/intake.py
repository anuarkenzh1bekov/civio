import json
import logging
from typing import Any

import anthropic
from fastapi import APIRouter, Request
from pydantic import ValidationError

from app.config import ANTHROPIC_MODEL, ai_provider, today as utc_today
from app.intake.extract import CHAT_SYSTEM, GEMINI_CHAT_SCHEMA, GEMINI_SCHEMA, SYSTEM, ChatExtraction, Extraction, to_result
from app.intake.flow import FLOW_FIELDS, answer_from_rules, describe_patch
from app.intake.parse import parse_intake
from app.llm.gemini import GeminiError, gemini_text
from app.routers.common import error, read_body
from app.schemas import Image, IntakeBody, IntakeChatBody

router = APIRouter(prefix="/api/intake")
log = logging.getLogger("civio.intake")


def _gemini_parts(image: Image | None, prompt: str) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    if image:
        parts.append({"inlineData": {"mimeType": image.mediaType, "data": image.data}})
    parts.append({"text": prompt})
    return parts


def _claude_content(image: Image | None, prompt: str) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    if image:
        content.append({"type": "image", "source": {"type": "base64", "media_type": image.mediaType, "data": image.data}})
    content.append({"type": "text", "text": prompt})
    return content


def _with_notice(result: dict[str, Any], notice: str | None) -> dict[str, Any]:
    return {**result, "notice": notice} if notice else result


@router.post("")
async def intake(request: Request):
    """Read a free-text description of a move, or a photo of a document, into profile fields."""
    body = await read_body(request, IntakeBody)
    if not body:
        return error("Send a description of your move or a photo of a document.")
    today = utc_today()

    def fallback(notice: str | None = None) -> dict[str, Any]:
        return _with_notice({**parse_intake(body.text, today), "mode": "rules_only"}, notice)

    provider = ai_provider()
    if not provider:
        return fallback(
            "Reading a photo needs the AI model, which is not configured here. Only the text was read."
            if body.image else None
        )

    prompt = f"Today's date: {today}\n\nDescription:\n{body.text.strip() or '(none, read the attached document)'}"

    if provider == "google":
        try:
            raw = await gemini_text(
                SYSTEM, [{"role": "user", "parts": _gemini_parts(body.image, prompt)}], json_schema=GEMINI_SCHEMA
            )
            extraction = Extraction.model_validate(json.loads(raw))
        except ValidationError:
            return fallback("The AI model's answer could not be used. The text was read with built-in rules instead.")
        except GeminiError as failure:
            if failure.kind == "auth":
                return fallback("The AI model's API key was rejected. The text was read with built-in rules instead.")
            if failure.kind == "rate_limit":
                return fallback("The AI model is busy. The text was read with built-in rules instead.")
            log.error("intake error: %s", failure)
            return fallback("The AI model could not read this. The text was read with built-in rules instead.")
        except ValueError as failure:  # the reply was not JSON
            log.error("intake error: %s", failure)
            return fallback("The AI model could not read this. The text was read with built-in rules instead.")
        return {**to_result(extraction), "mode": "ai"}

    try:
        response = await anthropic.AsyncAnthropic().messages.parse(
            model=ANTHROPIC_MODEL,
            max_tokens=4000,
            output_config={"effort": "low"},
            output_format=Extraction,
            system=SYSTEM,
            messages=[{"role": "user", "content": _claude_content(body.image, prompt)}],
        )
    except anthropic.AuthenticationError:
        return fallback("The AI model's API key was rejected. The text was read with built-in rules instead.")
    except anthropic.RateLimitError:
        return fallback("The AI model is busy. The text was read with built-in rules instead.")
    except Exception as failure:  # the text is always read, by the model or by rules
        log.error("intake error: %s", failure)
        return fallback("The AI model could not be reached. The text was read with built-in rules instead.")
    if response.stop_reason == "refusal" or not response.parsed_output:
        return fallback("The AI model could not read this. The text was read with built-in rules instead.")
    return {**to_result(response.parsed_output), "mode": "ai"}


@router.post("/chat")
async def intake_chat(request: Request):
    """Read one reply in the guided conversation, in the context of the question that was asked."""
    body = await read_body(request, IntakeChatBody)
    latest = body.messages[-1] if body else None
    if not body or not latest or latest.role != "user" or (latest.content.strip() == "" and not body.image):
        return error("Send a message.")
    today = utc_today()
    text = latest.content.strip()

    def fallback(notice: str | None = None) -> dict[str, Any]:
        """Built-in rules: the whole text through the free-text parser, plus the short answer to the open question."""
        whole = parse_intake(text, today)
        short = answer_from_rules(body.asking, text)
        found = list(whole["found"])
        for item in describe_patch(short["patch"]):
            if not any(entry["field"] == item["field"] for entry in found):
                found.append({"field": item["field"], "label": item["text"], "value": item["text"], "from": "your answer"})
        return _with_notice(
            {"profile": {**whole["profile"], **short["patch"]}, "found": found, "declined": short["declined"], "mode": "rules_only"},
            notice,
        )

    provider = ai_provider()
    if not provider:
        return fallback()

    recent = "\n".join(f"{'Person' if m.role == 'user' else 'Civio'}: {m.content}" for m in body.messages[-6:])
    profile = json.dumps(body.profile.to_dict(), separators=(",", ":"), ensure_ascii=False)
    prompt = "\n\n".join(filter(None, [
        f"Today's date: {today}",
        f"Profile so far: {profile}",
        f"The last question was about: {body.asking or 'nothing in particular'}",
        f"Recent messages:\n{recent}",
        "The person attached a photo of a document; read it as well." if body.image else "",
    ]))

    def result(extraction: ChatExtraction) -> dict[str, Any]:
        declined = [field for field in extraction.declined if field in FLOW_FIELDS]
        return {**to_result(extraction), "declined": declined, "mode": "ai"}

    if provider == "google":
        try:
            raw = await gemini_text(
                CHAT_SYSTEM,
                [{"role": "user", "parts": _gemini_parts(body.image, prompt)}],
                json_schema=GEMINI_CHAT_SCHEMA,
                max_output_tokens=1500,
            )
            return result(ChatExtraction.model_validate(json.loads(raw)))
        except ValidationError:
            return fallback("The AI model's answer could not be used, so built-in rules read it.")
        except GeminiError as failure:
            if failure.kind == "rate_limit":
                return fallback("The AI model is busy, so built-in rules read it.")
            if failure.kind == "auth":
                return fallback("The AI model's API key was rejected, so built-in rules read it.")
            log.error("intake chat error: %s", failure)
            return fallback("The AI model could not read this, so built-in rules read it.")
        except ValueError as failure:  # the reply was not JSON
            log.error("intake chat error: %s", failure)
            return fallback("The AI model could not read this, so built-in rules read it.")

    try:
        response = await anthropic.AsyncAnthropic().messages.parse(
            model=ANTHROPIC_MODEL,
            max_tokens=2000,
            output_config={"effort": "low"},
            output_format=ChatExtraction,
            system=CHAT_SYSTEM,
            messages=[{"role": "user", "content": _claude_content(body.image, prompt)}],
        )
    except Exception as failure:  # the reply is always read, by the model or by rules
        log.error("intake chat error: %s", failure)
        return fallback("The AI model could not be reached, so built-in rules read it.")
    if response.stop_reason == "refusal" or not response.parsed_output:
        return fallback("The AI model could not read this, so built-in rules read it.")
    return result(response.parsed_output)
