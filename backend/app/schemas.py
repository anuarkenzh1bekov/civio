"""Request shapes. Strict on purpose: these mirror what the browser sends, and a
value of the wrong type is rejected instead of coerced."""

from typing import Annotated, Any, ClassVar, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.states import is_state_code


class Model(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", allow_inf_nan=False)

    # A field may be left out, but an explicit null is only accepted where listed here.
    nullable: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _reject_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for key, value in data.items():
                if value is None and key in cls.model_fields and key not in cls.nullable:
                    raise ValueError(f"{key} must not be null")
        return data

    def to_dict(self) -> dict[str, Any]:
        """Only what was sent, so an unanswered question stays absent."""
        return self.model_dump(exclude_unset=True)


def _state(value: str) -> str:
    if not is_state_code(value):
        raise ValueError("not a US state code")
    return value


State = Annotated[str, AfterValidator(_state)]
IsoDate = Annotated[str, Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")]
Dollars = Annotated[float, Field(ge=0, le=10_000_000)]
Employment = Literal["employee", "self_employed", "unemployed"]
Income = Literal["w2", "1099", "both", "none"]
Marital = Literal["single", "married", "divorced", "widowed"]
Insurance = Literal["employer", "marketplace", "medicaid", "other", "none"]


class Budget(Model):
    """The move budget planner: monthly figures before and after, and one-off moving cost."""

    incomeNow: Dollars | None = None
    incomeAfter: Dollars | None = None
    housingNow: Dollars | None = None
    housingAfter: Dollars | None = None
    otherNow: Dollars | None = None
    otherAfter: Dollars | None = None
    moving: Dollars | None = None


class Profile(Model):
    """The profile as the server accepts it. Unknown keys are dropped."""

    currentState: State | None = None
    destinationState: State | None = None
    moveDate: IsoDate | None = None
    arrivedOn: IsoDate | None = None
    zip: Annotated[str, Field(pattern=r"^[0-9]{5}$")] | None = None
    employment: Employment | None = None
    income: Income | None = None
    marital: Marital | None = None
    hasChildren: bool | None = None
    childAges: Annotated[list[Annotated[int, Field(ge=0, le=25)]], Field(max_length=12)] | None = None
    insurance: Insurance | None = None
    hasVehicle: bool | None = None
    drives: bool | None = None
    budget: Budget | None = None
    vehicleRegisteredInCurrentState: bool | None = None
    aiConsent: bool | None = None


Metro = Annotated[str, Field(pattern=r"^[0-9]{5}$")]


class Forecast(Model):
    """Answers behind the budget estimate. The estimate itself is calculated in the browser."""

    nullable = frozenset({"offer"})

    origin: State
    destination: State
    originMetro: Metro | None = None
    destinationMetro: Metro | None = None
    people: Annotated[int, Field(ge=1, le=5)]
    bedrooms: Annotated[int, Field(ge=0, le=4)]
    payMode: Literal["gross", "net"]
    pay: Dollars
    filing: Literal["single", "joint"]
    offer: Dollars | None
    moving: Dollars | Literal["estimate"]

    @model_validator(mode="after")
    def _different_states(self) -> "Forecast":
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        return self


class SessionProfile(Profile):
    forecast: Forecast | None = None

    @model_validator(mode="after")
    def _forecast_matches(self) -> "SessionProfile":
        f = self.forecast
        if f and (f.origin != self.currentState or f.destination != self.destinationState):
            raise ValueError("forecast does not match the profile's states")
        return self


Key = Annotated[str, Field(max_length=64)]


class Session(Model):
    """What a session holds. Validated on every write, so the store never keeps arbitrary JSON."""

    profile: SessionProfile
    done: Annotated[list[Key], Field(max_length=200)]
    demo: bool
    costs: dict[Key, Annotated[float, Field(ge=-1_000_000, le=1_000_000)]]
    pack: bool


class Image(Model):
    mediaType: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]
    # Base64 without the data: prefix. About 5 MB of image at most.
    data: Annotated[str, Field(min_length=1, max_length=7_000_000, pattern=r"^[A-Za-z0-9+/]+=*$")]


class ProfileBody(Model):
    profile: Profile


class DocumentBody(Model):
    # The finished template letter, built in the browser from the user's own inputs.
    letter: Annotated[str, Field(min_length=40, max_length=6000)]
    # What the user wants changed or added.
    instructions: Annotated[str, Field(max_length=600)] = ""


class IntakeBody(Model):
    text: Annotated[str, Field(max_length=4000)] = ""
    image: Image | None = None

    @model_validator(mode="after")
    def _something_to_read(self) -> "IntakeBody":
        if self.text.strip() == "" and not self.image:
            raise ValueError("Nothing to read.")
        return self


FlowField = Literal[
    "currentState", "destinationState", "moveDate", "employment", "insurance",
    "hasVehicle", "drives", "hasChildren", "childAges",
]


class IntakeMessage(Model):
    role: Literal["user", "assistant"]
    content: Annotated[str, Field(max_length=4000)]


class IntakeChatBody(Model):
    nullable = frozenset({"asking"})

    messages: Annotated[list[IntakeMessage], Field(min_length=1, max_length=12)]
    # The profile so far, as the form holds it.
    profile: Profile = Profile()
    # The field the last question was about, so "yes" or "no" has a meaning.
    asking: FlowField | None = None
    image: Image | None = None


class AssistantMessage(Model):
    role: Literal["user", "assistant"]
    content: Annotated[str, Field(min_length=1, max_length=2000)]


class AssistantBody(Model):
    nullable = frozenset({"profile"})

    messages: Annotated[list[AssistantMessage], Field(min_length=1, max_length=24)]
    profile: Profile | None = None
