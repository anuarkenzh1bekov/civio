"""Subscriptions retain their existing Firestore fields and local SQLite schema."""

import json
import sqlite3
from contextlib import closing, contextmanager
from typing import Literal, NotRequired, TypedDict

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from app import cloud_store
from app.config import DATA_DIR


class Subscription(TypedDict):
    sid: str
    email: str
    status: Literal["pending", "confirmed", "unsubscribed"]
    token: str
    createdAt: int
    confirmSentAt: int
    confirmedAt: NotRequired[int]
    sent: list[str]


@contextmanager
def _local():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DATA_DIR / "civio.db")) as db, db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='reminders'").fetchone():
            db.execute("BEGIN IMMEDIATE")
            db.execute("CREATE TABLE IF NOT EXISTS reminders (sid TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS reminders_token ON reminders (token)")
            legacy = DATA_DIR / "reminders.json"
            if legacy.is_file():
                for row in json.loads(legacy.read_text(encoding="utf-8")):
                    db.execute("INSERT OR IGNORE INTO reminders VALUES (?, ?, ?)",
                               (row["sid"], row["token"], json.dumps(row)))
            db.commit()
        yield db


def get(sid: str) -> Subscription | None:
    if cloud_store.enabled():
        return cloud_store.database().collection("reminders").document(sid).get().to_dict()
    with _local() as db:
        row = db.execute("SELECT data FROM reminders WHERE sid=?", (sid,)).fetchone()
        return json.loads(row[0]) if row else None


def by_token(token: str) -> Subscription | None:
    if len(token) < 16:
        return None
    if cloud_store.enabled():
        query = cloud_store.database().collection("reminders").where(filter=FieldFilter("token", "==", token))
        doc = next(query.limit(1).stream(), None)
        return doc.to_dict() if doc else None
    with _local() as db:
        row = db.execute("SELECT data FROM reminders WHERE token=?", (token,)).fetchone()
        return json.loads(row[0]) if row else None


def confirmed() -> list[Subscription]:
    if cloud_store.enabled():
        query = cloud_store.database().collection("reminders").where(filter=FieldFilter("status", "==", "confirmed"))
        return [doc.to_dict() for doc in query.stream()]
    with _local() as db:
        return [json.loads(row[0]) for row in db.execute(
            "SELECT data FROM reminders WHERE json_extract(data, '$.status')='confirmed'"
        )]


def replace(sid: str, old: Subscription | None, new: Subscription | None) -> bool:
    """An email in flight must never undo an unsubscribe or overwrite a newer address."""
    if cloud_store.enabled():
        db = cloud_store.database()
        doc = db.collection("reminders").document(sid)

        @firestore.transactional
        def update(transaction):
            if doc.get(transaction=transaction).to_dict() != old:
                return False
            if new is None:
                transaction.delete(doc)
            else:
                transaction.set(doc, new)
            return True

        return update(db.transaction())

    with _local() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT data FROM reminders WHERE sid=?", (sid,)).fetchone()
        if (json.loads(row[0]) if row else None) != old:
            return False
        if new is None:
            db.execute("DELETE FROM reminders WHERE sid=?", (sid,))
        else:
            db.execute("INSERT INTO reminders (sid,token,data) VALUES (?,?,?) "
                       "ON CONFLICT(sid) DO UPDATE SET token=excluded.token,data=excluded.data",
                       (sid, new["token"], json.dumps(new)))
        return True
