import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / ".data"
if not DATA_DIR.exists() and (BACKEND_DIR.parent / ".data").is_dir():
    DATA_DIR = BACKEND_DIR.parent / ".data"

# .env.local wins over .env; real environment variables win over both.
load_dotenv(BACKEND_DIR / ".env.local")
load_dotenv(BACKEND_DIR / ".env")

ANTHROPIC_MODEL = "claude-opus-5-5"


def ai_provider() -> Literal["google", "anthropic"] | None:
    """Which model provider is configured. Google wins when both are set; None means rules only."""
    if os.environ.get("GOOGLE_API_KEY"):
        return "google"
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "anthropic"
    return None


def cors_origins() -> list[str]:
    """Extra origins allowed to call the API, for when web/ is served from another host."""
    return [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]


def today() -> str:
    """Today's date in UTC as yyyy-mm-dd."""
    return datetime.now(timezone.utc).date().isoformat()
