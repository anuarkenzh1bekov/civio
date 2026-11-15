from app.intake.extract import Extraction, to_result
from app.intake.flow import answer_from_rules, describe_patch
from app.intake.parse import parse_intake

from .conftest import TODAY


def read(text: str) -> dict:
    return parse_intake(text, TODAY)["profile"]


# ── Free-text intake (rules fallback) ──

def test_reads_the_briefs_example_in_russian():
    profile = read("Переезжаю из Остина в Сан-Диего 1 января, есть машина, страховка от работодателя")
    assert profile == {
        "currentState": "TX", "destinationState": "CA", "moveDate": "2027-01-01",
        "hasVehicle": True, "insurance": "employer",
    }


def test_reads_an_english_description():
    profile = read(
        "I'm moving from Austin, TX to San Diego on January 15, 2027 with my wife and two kids aged 7 and 3. "
        "I freelance, we have one car, and our insurance is through the marketplace."
    )
    assert profile == {
        "currentState": "TX", "destinationState": "CA", "moveDate": "2027-01-15", "marital": "married",
        "hasChildren": True, "childAges": [7, 3], "employment": "self_employed", "income": "1099",
        "hasVehicle": True, "insurance": "marketplace",
    }


def test_leaves_out_what_was_not_said_and_understands_a_no():
    assert read("Moving to California from Texas. No kids, no car.") == {
        "currentState": "TX", "destinationState": "CA", "hasChildren": False, "childAges": [], "hasVehicle": False,
    }


def test_does_not_mistake_a_count_of_cars_for_a_date():
    assert "moveDate" not in read("есть 1 машина")


# ── Answers read without a model ──

def test_reads_yes_and_no_for_the_question_that_was_asked():
    assert answer_from_rules("hasVehicle", "yes, one car")["patch"] == {"hasVehicle": True}
    assert answer_from_rules("hasVehicle", "No, I don't have one")["patch"] == {"hasVehicle": False}
    assert answer_from_rules("hasChildren", "nope")["patch"] == {"hasChildren": False, "childAges": []}


def test_reads_employment_insurance_and_childrens_ages():
    assert answer_from_rules("employment", "I freelance")["patch"] == {"employment": "self_employed", "income": "1099"}
    assert answer_from_rules("insurance", "through my job")["patch"] == {"insurance": "employer"}
    assert answer_from_rules("insurance", "no insurance")["patch"] == {"insurance": "none"}
    assert answer_from_rules("childAges", "4 and 9")["patch"] == {"hasChildren": True, "childAges": [4, 9]}


def test_treats_not_sure_as_a_declined_question_not_as_a_no():
    assert answer_from_rules("hasVehicle", "not sure yet") == {"patch": {}, "declined": ["hasVehicle"]}


def test_reads_nothing_when_there_is_no_open_question_or_no_match():
    assert answer_from_rules(None, "yes")["patch"] == {}
    assert answer_from_rules("insurance", "hmm")["patch"] == {}


def test_describes_a_patch_in_plain_words():
    assert describe_patch({"destinationState": "FL"})[0]["text"] == "Moving to Florida"
    assert describe_patch({"moveDate": "2027-01-05"})[0]["text"] == "Jan 5, 2027"


# ── Model output ──

def extraction(**fields) -> Extraction:
    empty = dict.fromkeys(Extraction.model_fields)
    return Extraction.model_validate({**empty, "evidence": [], **fields})


def test_model_output_is_checked_field_by_field():
    result = to_result(extraction(
        currentState="texas", destinationState="Atlantis", childAges=[7, 3], hasVehicle=True, zip="941",
        evidence=[{"field": "currentState", "quote": "from Austin"}],
    ))
    # A state name becomes its code; an unknown state and a short ZIP are dropped.
    assert result["profile"] == {"currentState": "TX", "childAges": [7, 3], "hasVehicle": True}
    assert result["found"][0] == {"field": "currentState", "label": "Moving from", "value": "TX", "from": "from Austin"}
    assert [item["value"] for item in result["found"][1:]] == ["7, 3", "Yes"]
