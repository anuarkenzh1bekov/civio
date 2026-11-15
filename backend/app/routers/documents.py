import logging

import anthropic
from fastapi import APIRouter, Request

from app.config import ANTHROPIC_MODEL, ai_provider
from app.llm.gemini import GeminiError, gemini_text
from app.routers.common import error, read_body, text_of
from app.schemas import DocumentBody

router = APIRouter(prefix="/api")
log = logging.getLogger("civio.documents")

SYSTEM = """You edit short personal letters for people who are moving between US states: change-of-address letters, move-out notices, insurance update requests, school record requests.

You receive a complete draft built from a template, and sometimes a note from the writer about what to change. Return the full revised letter as plain text, ready to print, with nothing before or after it.

The draft's facts are the writer's own: names, addresses, dates, account references. Keep them exactly as written, and keep any [bracketed placeholder] as it is, because it marks something the writer still has to fill in. Work in details from the writer's note where they fit.

These letters go to banks, landlords and agencies, and the writer may rely on them later, so the letter should only say things the writer told you. Do not add legal claims, statute references, notice periods, deadlines or dollar amounts of your own; if the note asks for one, add a [bracketed placeholder] for the writer to fill in. Keep the tone plain and polite, and keep the letter to one page."""


@router.post("/documents")
async def tailor(request: Request):
    """Rewrite a finished template letter for tone and for details the writer adds."""
    body = await read_body(request, DocumentBody)
    if not body:
        return error("Invalid request.")

    def template(notice: str) -> dict[str, str]:
        return {"letter": body.letter, "mode": "template", "notice": notice}

    provider = ai_provider()
    if not provider:
        return template("AI tailoring is not configured here. This is the standard letter.")
    note = body.instructions.strip() or "No special requests. Tidy the wording."
    prompt = f"<draft>\n{body.letter}\n</draft>\n\n<note>\n{note}\n</note>"

    if provider == "google":
        try:
            text = await gemini_text(SYSTEM, [{"role": "user", "parts": [{"text": prompt}]}])
        except GeminiError as failure:
            if failure.kind == "auth":
                return template("The AI model's API key was rejected. This is the standard letter.")
            if failure.kind == "rate_limit":
                return template("The AI model is busy. This is the standard letter.")
            if failure.kind == "blocked":
                return template("The AI model declined this request. This is the standard letter.")
            log.error("documents error: %s", failure)
            return template("The AI model could not be reached. This is the standard letter.")
        if not text:
            return template("The AI model returned nothing. This is the standard letter.")
        return {"letter": text, "mode": "ai"}

    try:
        response = await anthropic.AsyncAnthropic().messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=4000,
            output_config={"effort": "low"},
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        return template("The AI model's API key was rejected. This is the standard letter.")
    except anthropic.RateLimitError:
        return template("The AI model is busy. This is the standard letter.")
    except Exception as failure:  # the letter always comes back, tailored or not
        log.error("documents error: %s", failure)
        return template("The AI model could not be reached. This is the standard letter.")
    if response.stop_reason == "refusal":
        return template("The AI model declined this request. This is the standard letter.")
    text = text_of(response).strip()
    if not text:
        return template("The AI model returned nothing. This is the standard letter.")
    return {"letter": text, "mode": "ai"}
