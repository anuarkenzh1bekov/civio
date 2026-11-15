"""Anonymous sessions. A session is a JSON document keyed by a random UUID that
the browser generates; whoever holds the id (the "continue on another device"
link) can read and write it. There are no accounts.

Storage is SQLite in `.data/civio.db`. For a multi-instance deployment, replace
this with Postgres: the interface is two functions.
"""

import json
import re
import sqlite3
from contextlib import closing

from app.config import DATA_DIR

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z")


def is_session_id(value: str) -> bool:
    return bool(_UUID.match(value))


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA_DIR / "civio.db")
    db.execute(
        "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"
    )
    return db


def get(session_id: str) -> tuple[str, int] | None:
    """The stored JSON and when it was written (ms since the epoch)."""
    with closing(_connect()) as db:
        row = db.execute("SELECT data, updated_at FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row:
        return row[0], row[1]
    # Sessions saved by the earlier Node server, one JSON file each. Ids are
    # validated as UUIDs before they get here, so they are safe as file names.
    try:
        legacy = json.loads((DATA_DIR / "sessions" / f"{session_id}.json").read_text(encoding="utf-8"))
        return legacy["data"], legacy["updatedAt"]
    except (OSError, ValueError, KeyError):
        return None


def put(session_id: str, data: str, updated_at: int) -> None:
    with closing(_connect()) as db, db:
        db.execute(
            "INSERT INTO sessions (id, data, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            (session_id, data, updated_at),
        )
