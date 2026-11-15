from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.schemas import Profile
from app.states import US_STATES


class Evidence(BaseModel):
    model_config = ConfigDict(strict=True)

    field: str
    quote: str


class Extraction(BaseModel):
    """What the model must return. Every field is required and nullable: null means "not stated"."""

    model_config = ConfigDict(strict=True)

    currentState: str | None = Field(description="Two-letter USPS code of the state the person lives in now")
    destinationState: str | None = Field(description="Two-letter USPS code of the state they are moving to")
    moveDate: str | None = Field(description="Move date as yyyy-mm-dd")
    zip: str | None = Field(description="5-digit ZIP code of the new address")
    employment: Literal["employee", "self_employed", "unemployed"] | None
    income: Literal["w2", "1099", "both", "none"] | None
    marital: Literal["single", "married", "divorced", "widowed"] | None
    hasChildren: bool | None
    childAges: list[float] | None
    insurance: Literal["employer", "marketplace", "medicaid", "other", "none"] | None
    hasVehicle: bool | None
    drives: bool | None = Field(description="True when the person will drive after the move")
    vehicleRegisteredInCurrentState: bool | None
    evidence: list[Evidence] = Field(
        description="For each non-null field: the field name and the few words or the document detail it was read from"
    )


class ChatExtraction(Extraction):
    """The chat adds one list: the questions the person declined to answer."""

    declined: list[str] = Field(
        description="Names of fields the person said they do not know or do not want to answer"
    )


def _nullable(kind: str, **extra: Any) -> dict[str, Any]:
    return {"type": kind, "nullable": True, **extra}


# The same shape for Gemini, which takes an OpenAPI-style schema.
GEMINI_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "currentState": _nullable("STRING", description="Two-letter USPS code of the state the person lives in now"),
        "destinationState": _nullable("STRING", description="Two-letter USPS code of the state they are moving to"),
        "moveDate": _nullable("STRING", description="Move date as yyyy-mm-dd"),
        "zip": _nullable("STRING", description="5-digit ZIP code of the new address"),
        "employment": _nullable("STRING", enum=["employee", "self_employed", "unemployed"]),
        "income": _nullable("STRING", enum=["w2", "1099", "both", "none"]),
        "marital": _nullable("STRING", enum=["single", "married", "divorced", "widowed"]),
        "hasChildren": _nullable("BOOLEAN"),
        "childAges": _nullable("ARRAY", items={"type": "INTEGER"}),
        "insurance": _nullable("STRING", enum=["employer", "marketplace", "medicaid", "other", "none"]),
        "hasVehicle": _nullable("BOOLEAN"),
        "drives": _nullable("BOOLEAN", description="True when the person will drive after the move"),
        "vehicleRegisteredInCurrentState": _nullable("BOOLEAN"),
        "evidence": {
            "type": "ARRAY",
            "description": "For each non-null field: the field name and the few words or the document detail it was read from",
            "items": {
                "type": "OBJECT",
                "properties": {"field": {"type": "STRING"}, "quote": {"type": "STRING"}},
                "required": ["field", "quote"],
            },
        },
    },
    "required": [
        "currentState", "destinationState", "moveDate", "zip", "employment", "income", "marital", "hasChildren",
        "childAges", "insurance", "hasVehicle", "drives", "vehicleRegisteredInCurrentState", "evidence",
    ],
}

GEMINI_CHAT_SCHEMA: dict[str, Any] = {
    **GEMINI_SCHEMA,
    "properties": {
        **GEMINI_SCHEMA["properties"],
        "declined": {
            "type": "ARRAY",
            "description": "Names of fields the person said they do not know or do not want to answer",
            "items": {"type": "STRING"},
        },
    },
    "required": [*GEMINI_SCHEMA["required"], "declined"],
}

_STATE_BY_NAME = {name.lower(): code for code, name in US_STATES}

SYSTEM = """You turn a person's description of a move between US states into a structured profile for Civio, a moving checklist app. The input is free text in any language, a photo of a document (driver license, insurance card, lease, vehicle registration), or both.

A rule engine uses this profile to decide which legal deadlines apply, and the person reviews every field before it is saved. A field you fill in without support produces a wrong task, while a field you leave null simply becomes a question the app asks. So fill a field only when the text or the document states it or clearly implies it, and return null otherwise.

Reading notes:
- Cities map to their state (Austin is TX). States are two-letter USPS codes.
- A date without a year means its next occurrence after today's date, which is given in the request.
- From a document, use only what it shows: a driver license shows the current state; a lease shows the new address (ZIP, destination state) and its start date is a reasonable move date; an insurance card shows the kind of coverage; a vehicle registration means they own a vehicle and shows where it is registered.
- "1099", freelance or contract work means self_employed with income "1099"; use "both" only when a regular job is mentioned too.
- "drives" is true when the person says they drive or will drive after the move; a person bringing a car drives.
- Do not copy names, license numbers, policy numbers or street addresses into any field or into evidence. Evidence is a short phrase such as "lease start date" or the words the person wrote."""

# The guided chat reads one reply at a time, in the context of the question that was just asked.
CHAT_SYSTEM = f"""{SYSTEM}

This is a guided conversation. The app asks one question at a time and the person answers it, usually briefly ("yes", "self-employed", "two kids, 4 and 9"), though they may also tell you several things at once. The request gives the profile so far, the field the last question was about ("asking"), and the recent messages.
- A short answer belongs to the field in "asking". "Yes" or "no" to a question about a vehicle sets hasVehicle, not another field.
- Return only what the latest message adds. Never repeat fields that are already in the profile unless the person corrects them.
- If the person says they do not know, would rather not say, or want to skip, put the field name from "asking" in declined and leave it null.
- Questions from the person (not answers) set nothing."""

LABELS = {
    "currentState": "Moving from",
    "destinationState": "Moving to",
    "moveDate": "Move date",
    "zip": "New ZIP code",
    "employment": "Employment",
    "income": "Income type",
    "marital": "Marital status",
    "hasChildren": "Children",
    "childAges": "Children's ages",
    "insurance": "Health insurance",
    "hasVehicle": "Vehicle",
    "drives": "Drives",
    "vehicleRegisteredInCurrentState": "Vehicle registered in current state",
}


def to_result(extraction: Extraction) -> dict[str, Any]:
    """Model output goes through the same schema as any other profile; what fails is dropped, field by field."""
    profile: dict[str, Any] = {}
    found: list[dict[str, str]] = []
    quotes = {item.field: item.quote[:80] for item in extraction.evidence}
    for key, label in LABELS.items():
        value = getattr(extraction, key)
        if value is None:
            continue
        if key in ("currentState", "destinationState"):
            # A model sometimes writes the state's name instead of its code.
            value = _STATE_BY_NAME.get(value.strip().lower(), value.strip().upper())
        if key == "childAges":
            value = [int(age) if float(age).is_integer() else age for age in value]
        try:
            Profile.model_validate({key: value})
        except ValidationError:
            continue
        profile[key] = value
        if isinstance(value, list):
            shown = ", ".join(str(item) for item in value)
        elif isinstance(value, bool):
            shown = "Yes" if value else "No"
        else:
            shown = str(value)
        found.append({"field": key, "label": label, "value": shown, "from": quotes.get(key, "")})
    return {"profile": profile, "found": found}
