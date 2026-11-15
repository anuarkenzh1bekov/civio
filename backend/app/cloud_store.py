"""Cloud Run uses the same Firestore documents as the original Civio server."""

import os
from functools import cache

from google.cloud import firestore


def enabled() -> bool:
    return bool(os.getenv("K_SERVICE")) or os.getenv("STORE") == "firestore"


@cache
def database() -> firestore.Client:
    return firestore.Client()
