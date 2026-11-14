import { isStateCode, US_STATES } from "@/lib/states";
import type { Profile } from "@/lib/types";

/**
 * Rule-based reading of a free-text description of a move. This is the
 * fallback when no model is configured, and the shape the model's output is
 * forced into as well: only fields that were actually stated get a value.
 * English, plus the common Russian wording the team demos with.
 */

export type IntakeResult = {
  /** Only the fields that were found. */
  profile: Partial<Profile>;
  /** One short line per field: what was read and from which words. */
  found: { field: keyof Profile; label: string; value: string; from: string }[];
};

const CITIES: Record<string, string> = {
  austin: "TX", houston: "TX", dallas: "TX", "san antonio": "TX", "fort worth": "TX", "el paso": "TX",
  "san diego": "CA", "los angeles": "CA", "san francisco": "CA", "san jose": "CA", sacramento: "CA", oakland: "CA",
  "new york city": "NY", nyc: "NY", brooklyn: "NY", chicago: "IL", seattle: "WA", portland: "OR", denver: "CO",
  phoenix: "AZ", miami: "FL", orlando: "FL", tampa: "FL", boston: "MA", atlanta: "GA", "las vegas": "NV",
  nashville: "TN", philadelphia: "PA", detroit: "MI", minneapolis: "MN", "salt lake city": "UT",
  // Russian
  "остин": "TX", "хьюстон": "TX", "даллас": "TX", "техас": "TX",
  "сан-диего": "CA", "сан диего": "CA", "лос-анджелес": "CA", "лос анджелес": "CA", "сан-франциско": "CA",
  "сан франциско": "CA", "калифорни": "CA", "нью-йорк": "NY", "чикаго": "IL", "сиэтл": "WA", "флорид": "FL",
  "майами": "FL", "денвер": "CO", "бостон": "MA",
};

type Place = { code: string; index: number; end: number; text: string };

function findPlaces(text: string): Place[] {
  const lower = text.toLowerCase();
  const places: Place[] = [];
  const add = (needle: string, code: string, wholeWord: boolean) => {
    let from = 0;
    while (true) {
      const index = lower.indexOf(needle, from);
      if (index === -1) return;
      from = index + needle.length;
      if (wholeWord) {
        const before = lower[index - 1];
        const after = lower[index + needle.length];
        if ((before && /[a-z]/.test(before)) || (after && /[a-z]/.test(after))) continue;
      }
      places.push({ code, index, end: index + needle.length, text: text.slice(index, index + needle.length) });
    }
  };
  for (const state of US_STATES) add(state.name.toLowerCase(), state.code, true);
  for (const [city, code] of Object.entries(CITIES)) add(city, code, /^[a-z ]+$/.test(city));
  // Two-letter codes only when written in capitals, so "in", "or", "me" stay words.
  for (const match of text.matchAll(/\b[A-Z]{2}\b/g)) {
    if (isStateCode(match[0])) {
      places.push({ code: match[0], index: match.index, end: match.index + 2, text: match[0] });
    }
  }
  places.sort((a, b) => a.index - b.index || b.end - a.end);
  // Drop mentions nested inside a longer one ("New York" inside "New York City", "TX" after "Austin,").
  const kept: Place[] = [];
  for (const place of places) {
    const last = kept.at(-1);
    if (last && place.index < last.end) continue;
    kept.push(place);
  }
  return kept;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
  "январ": 1, "феврал": 2, "март": 3, "апрел": 4, "мая": 5, "май": 5, "июн": 6, "июл": 7, "август": 8, "сентябр": 9,
  "октябр": 10, "ноябр": 11, "декабр": 12,
};

function iso(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

/** A date without a year means the next time that day comes around. */
function nextOccurrence(month: number, day: number, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  const thisYear = iso(year, month, day);
  if (!thisYear) return undefined;
  return thisYear >= today ? thisYear : iso(year + 1, month, day);
}

function findDate(text: string, today: string): { date: string; from: string } | undefined {
  const lower = text.toLowerCase();
  const exact = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (exact) {
    const date = iso(Number(exact[1]), Number(exact[2]), Number(exact[3]));
    if (date) return { date, from: exact[0] };
  }
  const slash = lower.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) {
    const date = iso(Number(slash[3]), Number(slash[1]), Number(slash[2]));
    if (date) return { date, from: slash[0] };
  }
  const en = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
  const ru = "январ|феврал|март|апрел|мая|май|июн|июл|август|сентябр|октябр|ноябр|декабр";
  const patterns: { re: RegExp; month: number; day: number; year: number }[] = [
    { re: new RegExp(`\\b(${en})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`), month: 1, day: 2, year: 3 },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${en})\\b\\.?(?:,?\\s+(\\d{4}))?`), month: 2, day: 1, year: 3 },
    { re: new RegExp(`(\\d{1,2})(?:-?го)?\\s+(${ru})[а-яё]*(?:\\s+(\\d{4}))?`), month: 2, day: 1, year: 3 },
  ];
  for (const { re, month, day, year } of patterns) {
    const match = lower.match(re);
    if (!match) continue;
    const m = MONTHS[match[month] ?? ""];
    const d = Number(match[day]);
    if (!m) continue;
    const date = match[year] ? iso(Number(match[year]), m, d) : nextOccurrence(m, d, today);
    if (date) return { date, from: match[0].trim() };
  }
  return undefined;
}

function firstMatch(text: string, re: RegExp): string | undefined {
  return text.match(re)?.[0]?.trim();
}

export function parseIntake(text: string, today: string = new Date().toISOString().slice(0, 10)): IntakeResult {
  const profile: Partial<Profile> = {};
  const found: IntakeResult["found"] = [];
  const lower = text.toLowerCase();
  const note = (field: keyof Profile, label: string, value: string, from: string) =>
    found.push({ field, label, value, from });

  // ── States ──
  const places = findPlaces(text);
  let origin: Place | undefined;
  let destination: Place | undefined;
  for (const place of places) {
    const before = lower.slice(Math.max(0, place.index - 14), place.index);
    if (!origin && /(?:\bfrom|\bleaving|\bout of|(?:^|\s)из)\s+(?:the\s+)?$/.test(before)) origin = place;
    else if (!destination && /(?:\bto|\binto|\bfor|(?:^|\s)в)\s+(?:the\s+)?$/.test(before)) destination = place;
  }
  const rest = places.filter((place) => place !== origin && place !== destination);
  if (!origin && rest.length > 0 && (destination || rest.length > 1)) origin = rest.shift();
  if (!destination && rest.length > 0 && origin) destination = rest.find((place) => place.code !== origin?.code);
  if (origin) {
    profile.currentState = origin.code;
    note("currentState", "Moving from", origin.code, origin.text);
  }
  if (destination) {
    profile.destinationState = destination.code;
    note("destinationState", "Moving to", destination.code, destination.text);
  }

  // ── Move date ──
  const date = findDate(text, today);
  if (date) {
    profile.moveDate = date.date;
    note("moveDate", "Move date", date.date, date.from);
  }

  // ── ZIP ──
  const zip = text.match(/\b\d{5}\b/);
  if (zip) {
    profile.zip = zip[0];
    note("zip", "New ZIP code", zip[0], zip[0]);
  }

  // ── Vehicle ──
  const noCar = firstMatch(lower, /\b(?:no|without a|don'?t (?:have|own) a|do not (?:have|own) a|sold (?:my|the|our)) (?:car|vehicle)\b|нет (?:машины|авто)|без (?:машины|авто)/);
  const car = firstMatch(lower, /\b(?:car|cars|vehicle|truck|suv|motorcycle)\b|машин|автомобил/);
  if (noCar) {
    profile.hasVehicle = false;
    note("hasVehicle", "Vehicle", "No", noCar);
  } else if (car) {
    profile.hasVehicle = true;
    note("hasVehicle", "Vehicle", "Yes", car);
  }

  // ── Health insurance ──
  const insurance: [NonNullable<Profile["insurance"]>, string, RegExp][] = [
    ["none", "None", /\b(?:no|without) (?:health )?insurance\b|\buninsured\b|нет страховки|без страховки/],
    ["medicaid", "Medicaid", /\bmedicaid\b|\bmedi-cal\b|медикейд/],
    ["marketplace", "Marketplace", /\bmarketplace\b|\bobamacare\b|healthcare\.gov|covered california|маркетплейс/],
    ["employer", "Employer plan", /(?:insurance|coverage|plan)[^.]{0,30}(?:employer|job|work|company)|(?:employer|job|work|company)[^.]{0,30}(?:insurance|coverage|plan)|страховк[а-я]*[^.]{0,20}работодател|работодател[а-я]*[^.]{0,20}страховк/],
  ];
  for (const [value, label, re] of insurance) {
    const hit = firstMatch(lower, re);
    if (!hit) continue;
    profile.insurance = value;
    note("insurance", "Health insurance", label, hit);
    break;
  }

  // ── Work ──
  const unemployed = firstMatch(lower, /\bunemployed\b|\bbetween jobs\b|\bnot working\b|безработ|не работаю/);
  const self = firstMatch(lower, /\bself[- ]employed\b|\bfreelanc\w*|\bcontractor\b|\b1099\b|фриланс|самозанят/);
  const employee = firstMatch(lower, /\bw-?2\b|\bemployee\b|\bmy employer\b|\bfull[- ]time\b|\bwork (?:for|at)\b|\bmy job\b|работаю в|по найму/);
  if (unemployed) {
    profile.employment = "unemployed";
    note("employment", "Employment", "Unemployed", unemployed);
  } else if (self) {
    profile.employment = "self_employed";
    profile.income = employee ? "both" : "1099";
    note("employment", "Employment", "Self-employed", self);
    note("income", "Income type", employee ? "W-2 and 1099" : "1099", employee ? `${self}, ${employee}` : self);
  } else if (employee) {
    profile.employment = "employee";
    profile.income = "w2";
    note("employment", "Employment", "Employee", employee);
    note("income", "Income type", "W-2", employee);
  }

  // ── Family ──
  const married = firstMatch(lower, /\bmarried\b|\bmy (?:wife|husband|spouse)\b|женат|замужем|(?:^|\s)(?:с )?(?:женой|мужем)/);
  const single = firstMatch(lower, /\bsingle\b|\bon my own\b|не женат|не замужем/);
  if (single) {
    profile.marital = "single";
    note("marital", "Marital status", "Single", single);
  } else if (married) {
    profile.marital = "married";
    note("marital", "Marital status", "Married", married);
  }

  const noKids = firstMatch(lower, /\bno (?:kids|children)\b|\bchild-?free\b|без детей|нет детей/);
  const kids = firstMatch(lower, /\b(?:kids?|child|children|son|daughter|toddler|baby)\b|дет(?:и|ей|ьми)|ребён|ребен|сын|доч/);
  if (noKids) {
    profile.hasChildren = false;
    profile.childAges = [];
    note("hasChildren", "Children", "No", noKids);
  } else if (kids) {
    profile.hasChildren = true;
    const ages = new Set<number>();
    for (const match of lower.matchAll(/(\d{1,2})[- ]?(?:year|yr)s?[- ]?old|(\d{1,2})\s?(?:y\/o|yo)\b|(\d{1,2})\s(?:лет|года|год)(?![а-яё])/g)) {
      ages.add(Number(match[1] ?? match[2] ?? match[3]));
    }
    const list = lower.match(/\b(?:aged?|ages)\s+(\d{1,2}(?:\s*(?:,|and|&)\s*\d{1,2})*)/);
    if (list) for (const n of (list[1] ?? "").match(/\d{1,2}/g) ?? []) ages.add(Number(n));
    const valid = [...ages].filter((age) => age >= 0 && age <= 25);
    if (valid.length > 0) profile.childAges = valid;
    note("hasChildren", "Children", valid.length ? `Yes, ages ${valid.join(", ")}` : "Yes", kids);
  }

  return { profile, found };
}
