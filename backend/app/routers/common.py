from typing import TypeVar

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.schemas import Model

M = TypeVar("M", bound=Model)


def error(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


async def read_body(request: Request, model: type[M]) -> M | None:
    """The validated JSON body, or None when it is missing or does not fit."""
    try:
        return model.model_validate(await request.json())
    except (ValueError, ValidationError):
        return None


def text_of(response) -> str:
    """The text blocks of a Claude reply, joined."""
    return "".join(block.text for block in response.content if block.type == "text")
