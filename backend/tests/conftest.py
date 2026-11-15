import pytest

# The demo scenario from the brief: a family moving from Texas to California.
DEMO_PROFILE = {
    "currentState": "TX",
    "budget": {
        "incomeNow": 5400, "incomeAfter": 5900, "housingNow": 1600, "housingAfter": 2450,
        "otherNow": 1800, "otherAfter": 1950, "moving": 3200,
    },
    "drives": True,
    "destinationState": "CA",
    "moveDate": "2027-01-15",
    "zip": "94110",
    "employment": "employee",
    "income": "both",
    "marital": "married",
    "hasChildren": True,
    "childAges": [7, 3],
    "insurance": "marketplace",
    "hasVehicle": True,
    "vehicleRegisteredInCurrentState": True,
    "aiConsent": True,
}

TODAY = "2026-11-14"


def without(profile: dict, *keys: str) -> dict:
    return {key: value for key, value in profile.items() if key not in keys}


@pytest.fixture
def no_ai(monkeypatch):
    """No model keys: every AI feature falls back to built-in rules."""
    for name in ("GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(name, raising=False)
