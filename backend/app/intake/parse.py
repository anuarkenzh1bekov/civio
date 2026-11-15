"""Rule-based reading of a free-text description of a move. This is the
fallback when no model is configured, and the shape the model's output is
forced into as well: only fields that were actually stated get a value.
English, plus the common Russian wording the team demos with.

Patterns are compiled with re.ASCII so that \\b, \\d and \\s mean what they
meant in the original JavaScript; Cyrillic is matched by literal characters.
"""

import re
from datetime import date
from typing import Any

from app.states import US_STATES, is_state_code

CITIES = {
    "austin": "TX", "houston": "TX", "dallas": "TX", "san antonio": "TX", "fort worth": "TX", "el paso": "TX",
    "san diego": "CA", "los angeles": "CA", "san francisco": "CA", "san jose": "CA", "sacramento": "CA", "oakland": "CA",
    "new york city": "NY", "nyc": "NY", "brooklyn": "NY", "chicago": "IL", "seattle": "WA", "portland": "OR", "denver": "CO",
    "phoenix": "AZ", "miami": "FL", "orlando": "FL", "tampa": "FL", "boston": "MA", "atlanta": "GA", "las vegas": "NV",
    "nashville": "TN", "philadelphia": "PA", "detroit": "MI", "minneapolis": "MN", "salt lake city": "UT",
    # Russian
    "остин": "TX", "хьюстон": "TX", "даллас": "TX", "техас": "TX",
    "сан-диего": "CA", "сан диего": "CA", "лос-анджелес": "CA", "лос анджелес": "CA", "сан-франциско": "CA",
    "сан франциско": "CA", "калифорни": "CA", "нью-йорк": "NY", "чикаго": "IL", "сиэтл": "WA", "флорид": "FL",
    "майами": "FL", "денвер": "CO", "бостон": "MA",
}

A = re.ASCII
_LATIN = re.compile(r"[a-z]")
_LATIN_NAME = re.compile(r"^[a-z ]+\Z")
_CODE = re.compile(r"\b[A-Z]{2}\b", A)


def _find_places(text: str) -> list[dict[str, Any]]:
    lower = text.lower()
    places: list[dict[str, Any]] = []

    def add(needle: str, code: str, whole_word: bool) -> None:
        start = 0
        while True:
            index = lower.find(needle, start)
            if index == -1:
                return
            end = index + len(needle)
            start = end
            if whole_word:
                before = lower[index - 1] if index > 0 else ""
                after = lower[end] if end < len(lower) else ""
                if (before and _LATIN.match(before)) or (after and _LATIN.match(after)):
                    continue
            places.append({"code": code, "index": index, "end": end, "text": text[index:end]})

    for code, name in US_STATES:
        add(name.lower(), code, True)
    for city, code in CITIES.items():
        add(city, code, bool(_LATIN_NAME.match(city)))
    # Two-letter codes only when written in capitals, so "in", "or", "me" stay words.
    for match in _CODE.finditer(text):
        if is_state_code(match[0]):
            places.append({"code": match[0], "index": match.start(), "end": match.start() + 2, "text": match[0]})

    places.sort(key=lambda place: (place["index"], -place["end"]))
    # Drop mentions nested inside a longer one ("New York" inside "New York City", "TX" after "Austin,").
    kept: list[dict[str, Any]] = []
    for place in places:
        if kept and place["index"] < kept[-1]["end"]:
            continue
        kept.append(place)
    return kept


MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3, "april": 4, "apr": 4, "may": 5,
    "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
    "январ": 1, "феврал": 2, "март": 3, "апрел": 4, "мая": 5, "май": 5, "июн": 6, "июл": 7, "август": 8,
    "сентябр": 9, "октябр": 10, "ноябр": 11, "декабр": 12,
}


def _iso(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _next_occurrence(month: int, day: int, today: str) -> str | None:
    """A date without a year means the next time that day comes around."""
    year = int(today[:4])
    this_year = _iso(year, month, day)
    if not this_year:
        return None
    return this_year if this_year >= today else _iso(year + 1, month, day)


_EN = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec"
_RU = "январ|феврал|март|апрел|мая|май|июн|июл|август|сентябр|октябр|ноябр|декабр"
_EXACT_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b", A)
_SLASH_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", A)
# (pattern, month group, day group, year group)
_WORD_DATES = [
    (re.compile(rf"\b({_EN})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?", A), 1, 2, 3),
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_EN})\b\.?(?:,?\s+(\d{{4}}))?", A), 2, 1, 3),
    (re.compile(rf"(\d{{1,2}})(?:-?го)?\s+({_RU})[а-яё]*(?:\s+(\d{{4}}))?", A), 2, 1, 3),
]


def _find_date(text: str, today: str) -> tuple[str, str] | None:
    """The date and the words it was read from."""
    lower = text.lower()
    exact = _EXACT_DATE.search(lower)
    if exact:
        found = _iso(int(exact[1]), int(exact[2]), int(exact[3]))
        if found:
            return found, exact[0]
    slash = _SLASH_DATE.search(lower)
    if slash:
        found = _iso(int(slash[3]), int(slash[1]), int(slash[2]))
        if found:
            return found, slash[0]
    for pattern, month, day, year in _WORD_DATES:
        match = pattern.search(lower)
        if not match:
            continue
        m = MONTHS.get(match[month] or "")
        if not m:
            continue
        d = int(match[day])
        found = _iso(int(match[year]), m, d) if match[year] else _next_occurrence(m, d, today)
        if found:
            return found, match[0].strip()
    return None


def _first(text: str, pattern: re.Pattern[str]) -> str | None:
    match = pattern.search(text)
    return match[0].strip() if match else None


_ORIGIN_CUE = re.compile(r"(?:\bfrom|\bleaving|\bout of|(?:^|\s)из)\s+(?:the\s+)?\Z", A)
_DESTINATION_CUE = re.compile(r"(?:\bto|\binto|\bfor|(?:^|\s)в)\s+(?:the\s+)?\Z", A)
_ZIP = re.compile(r"\b\d{5}\b", A)
_NO_CAR = re.compile(r"\b(?:no|without a|don'?t (?:have|own) a|do not (?:have|own) a|sold (?:my|the|our)) (?:car|vehicle)\b|нет (?:машины|авто)|без (?:машины|авто)", A)
_CAR = re.compile(r"\b(?:car|cars|vehicle|truck|suv|motorcycle)\b|машин|автомобил", A)
_INSURANCE = [
    ("none", "None", re.compile(r"\b(?:no|without) (?:health )?insurance\b|\buninsured\b|нет страховки|без страховки", A)),
    ("medicaid", "Medicaid", re.compile(r"\bmedicaid\b|\bmedi-cal\b|медикейд", A)),
    ("marketplace", "Marketplace", re.compile(r"\bmarketplace\b|\bobamacare\b|healthcare\.gov|covered california|маркетплейс", A)),
    ("employer", "Employer plan", re.compile(r"(?:insurance|coverage|plan)[^.]{0,30}(?:employer|job|work|company)|(?:employer|job|work|company)[^.]{0,30}(?:insurance|coverage|plan)|страховк[а-я]*[^.]{0,20}работодател|работодател[а-я]*[^.]{0,20}страховк", A)),
]
_UNEMPLOYED = re.compile(r"\bunemployed\b|\bbetween jobs\b|\bnot working\b|безработ|не работаю", A)
_SELF_EMPLOYED = re.compile(r"\bself[- ]employed\b|\bfreelanc\w*|\bcontractor\b|\b1099\b|фриланс|самозанят", A)
_EMPLOYEE = re.compile(r"\bw-?2\b|\bemployee\b|\bmy employer\b|\bfull[- ]time\b|\bwork (?:for|at)\b|\bmy job\b|работаю в|по найму", A)
_MARRIED = re.compile(r"\bmarried\b|\bmy (?:wife|husband|spouse)\b|женат|замужем|(?:^|\s)(?:с )?(?:женой|мужем)", A)
_SINGLE = re.compile(r"\bsingle\b|\bon my own\b|не женат|не замужем", A)
_NO_KIDS = re.compile(r"\bno (?:kids|children)\b|\bchild-?free\b|без детей|нет детей", A)
_KIDS = re.compile(r"\b(?:kids?|child|children|son|daughter|toddler|baby)\b|дет(?:и|ей|ьми)|ребён|ребен|сын|доч", A)
_AGES = re.compile(r"(\d{1,2})[- ]?(?:year|yr)s?[- ]?old|(\d{1,2})\s?(?:y/o|yo)\b|(\d{1,2})\s(?:лет|года|год)(?![а-яё])", A)
_AGE_LIST = re.compile(r"\b(?:aged?|ages)\s+(\d{1,2}(?:\s*(?:,|and|&)\s*\d{1,2})*)", A)
_NUMBER = re.compile(r"\d{1,2}", A)


def parse_intake(text: str, today: str) -> dict[str, Any]:
    """Returns {"profile": only the fields that were found, "found": one line per field}."""
    profile: dict[str, Any] = {}
    found: list[dict[str, str]] = []
    lower = text.lower()

    def note(field: str, label: str, value: str, source: str) -> None:
        found.append({"field": field, "label": label, "value": value, "from": source})

    # ── States ──
    places = _find_places(text)
    origin = destination = None
    for place in places:
        before = lower[max(0, place["index"] - 14):place["index"]]
        if not origin and _ORIGIN_CUE.search(before):
            origin = place
        elif not destination and _DESTINATION_CUE.search(before):
            destination = place
    rest = [place for place in places if place is not origin and place is not destination]
    if not origin and rest and (destination or len(rest) > 1):
        origin = rest.pop(0)
    if not destination and rest and origin:
        destination = next((place for place in rest if place["code"] != origin["code"]), None)
    if origin:
        profile["currentState"] = origin["code"]
        note("currentState", "Moving from", origin["code"], origin["text"])
    if destination:
        profile["destinationState"] = destination["code"]
        note("destinationState", "Moving to", destination["code"], destination["text"])

    # ── Move date ──
    move_date = _find_date(text, today)
    if move_date:
        profile["moveDate"] = move_date[0]
        note("moveDate", "Move date", move_date[0], move_date[1])

    # ── ZIP ──
    zip_code = _ZIP.search(text)
    if zip_code:
        profile["zip"] = zip_code[0]
        note("zip", "New ZIP code", zip_code[0], zip_code[0])

    # ── Vehicle ──
    no_car = _first(lower, _NO_CAR)
    car = _first(lower, _CAR)
    if no_car:
        profile["hasVehicle"] = False
        note("hasVehicle", "Vehicle", "No", no_car)
    elif car:
        profile["hasVehicle"] = True
        note("hasVehicle", "Vehicle", "Yes", car)

    # ── Health insurance ──
    for value, label, pattern in _INSURANCE:
        hit = _first(lower, pattern)
        if not hit:
            continue
        profile["insurance"] = value
        note("insurance", "Health insurance", label, hit)
        break

    # ── Work ──
    unemployed = _first(lower, _UNEMPLOYED)
    self_employed = _first(lower, _SELF_EMPLOYED)
    employee = _first(lower, _EMPLOYEE)
    if unemployed:
        profile["employment"] = "unemployed"
        note("employment", "Employment", "Unemployed", unemployed)
    elif self_employed:
        profile["employment"] = "self_employed"
        profile["income"] = "both" if employee else "1099"
        note("employment", "Employment", "Self-employed", self_employed)
        note("income", "Income type", "W-2 and 1099" if employee else "1099",
             f"{self_employed}, {employee}" if employee else self_employed)
    elif employee:
        profile["employment"] = "employee"
        profile["income"] = "w2"
        note("employment", "Employment", "Employee", employee)
        note("income", "Income type", "W-2", employee)

    # ── Family ──
    married = _first(lower, _MARRIED)
    single = _first(lower, _SINGLE)
    if single:
        profile["marital"] = "single"
        note("marital", "Marital status", "Single", single)
    elif married:
        profile["marital"] = "married"
        note("marital", "Marital status", "Married", married)

    no_kids = _first(lower, _NO_KIDS)
    kids = _first(lower, _KIDS)
    if no_kids:
        profile["hasChildren"] = False
        profile["childAges"] = []
        note("hasChildren", "Children", "No", no_kids)
    elif kids:
        profile["hasChildren"] = True
        ages: dict[int, None] = {}
        for match in _AGES.finditer(lower):
            ages[int(match[1] or match[2] or match[3])] = None
        listed = _AGE_LIST.search(lower)
        if listed:
            for number in _NUMBER.findall(listed[1]):
                ages[int(number)] = None
        valid = [age for age in ages if 0 <= age <= 25]
        if valid:
            profile["childAges"] = valid
        note("hasChildren", "Children", f"Yes, ages {', '.join(map(str, valid))}" if valid else "Yes", kids)

    return {"profile": profile, "found": found}
