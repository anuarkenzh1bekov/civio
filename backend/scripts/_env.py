"""Load KEY=value lines from backend/.env.local and backend/.env for the command-line scripts."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env_files() -> None:
    """Variables already in the environment win; a missing file is fine."""
    for name in (".env.local", ".env"):
        try:
            lines = (ROOT / name).read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key.strip().removeprefix("export ").strip(), value)
