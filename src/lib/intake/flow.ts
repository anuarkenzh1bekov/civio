import { stateName } from "@/lib/states";
import type { Profile } from "@/lib/types";

/**
 * The guided conversation. What to ask next is decided here, from which profile
 * fields are still empty, never by the model. The model's only job is to read
 * what the person wrote into fields. That keeps the dialogue short, in a fixed
 * order, and unable to invent a question that no rule depends on.
 */

export type FlowField =
  | "currentState"
  | "destinationState"
  | "moveDate"
  | "employment"
  | "insurance"
  | "hasVehicle"
  | "drives"
  | "hasChildren"
  | "childAges";

/** A tap-to-answer button. `skip` marks the question as declined instead of answered. */
export type Chip = { label: string; patch?: Partial<Profile>; skip?: FlowField };
export type Question = { field: FlowField; text: string; chips: Chip[] };

export const FLOW_FIELDS: readonly FlowField[] = [
  "currentState", "destinationState", "moveDate", "employment", "insurance", "hasVehicle", "drives", "hasChildren", "childAges",
];

export const SUPPORTED_STATES = ["TX", "CA", "FL", "WA", "NY"] as const;
const NOT_SURE: Chip = { label: "Not sure" };

const yesNo = (field: FlowField, yes: Partial<Profile>, no: Partial<Profile>): Chip[] => [
  { label: "Yes", patch: yes },
  { label: "No", patch: no },
  { ...NOT_SURE, skip: field },
];

export function addDays(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The next question to ask, or null when everything has been answered or declined. */
export function nextQuestion(profile: Profile, skipped: readonly FlowField[], today: string): Question | null {
  const skip = (field: FlowField) => skipped.includes(field);
  const states = (field: "currentState" | "destinationState", other?: string): Chip[] =>
    SUPPORTED_STATES.filter((code) => code !== other).map((code) => ({ label: stateName(code), patch: { [field]: code } }));

  if (!profile.currentState) {
    return { field: "currentState", text: "Which state do you live in now? Pick one, or type any state.", chips: states("currentState", profile.destinationState) };
  }
  if (!profile.destinationState) {
    return { field: "destinationState", text: "And which state are you moving to?", chips: states("destinationState", profile.currentState) };
  }
  if (!profile.moveDate && !skip("moveDate")) {
    return {
      field: "moveDate",
      text: "When do you plan to move? Type a date, or pick one.",
      chips: [
        { label: "In 2 weeks", patch: { moveDate: addDays(today, 14) } },
        { label: "In a month", patch: { moveDate: addDays(today, 30) } },
        { label: "In 3 months", patch: { moveDate: addDays(today, 90) } },
        { ...NOT_SURE, skip: "moveDate" },
      ],
    };
  }
  if (!profile.employment && !skip("employment")) {
    return {
      field: "employment",
      text: "How do you earn your income? This decides which tax and withholding tasks you get.",
      chips: [
        { label: "Employee", patch: { employment: "employee", income: "w2" } },
        { label: "Self-employed", patch: { employment: "self_employed", income: "1099" } },
        { label: "Unemployed", patch: { employment: "unemployed", income: "none" } },
      ],
    };
  }
  if (!profile.insurance && !skip("insurance")) {
    return {
      field: "insurance",
      text: "How is your health insurance covered today?",
      chips: [
        { label: "Through my employer", patch: { insurance: "employer" } },
        { label: "Marketplace plan", patch: { insurance: "marketplace" } },
        { label: "Medicaid", patch: { insurance: "medicaid" } },
        { label: "Other", patch: { insurance: "other" } },
        { label: "None", patch: { insurance: "none" } },
      ],
    };
  }
  if (profile.hasVehicle === undefined && !skip("hasVehicle")) {
    return {
      field: "hasVehicle",
      text: "Are you bringing a vehicle with you? Registration is usually the first deadline.",
      chips: yesNo("hasVehicle", { hasVehicle: true, drives: true }, { hasVehicle: false }),
    };
  }
  if (profile.hasVehicle !== true && profile.drives === undefined && !skip("drives")) {
    return { field: "drives", text: "Will you drive after you move?", chips: yesNo("drives", { drives: true }, { drives: false }) };
  }
  if (profile.hasChildren === undefined && !skip("hasChildren")) {
    return {
      field: "hasChildren",
      text: "Do you have children moving with you?",
      chips: yesNo("hasChildren", { hasChildren: true }, { hasChildren: false, childAges: [] }),
    };
  }
  if (profile.hasChildren === true && !profile.childAges?.length && !skip("childAges")) {
    return { field: "childAges", text: "How old are they? For example: 4 and 9.", chips: [{ ...NOT_SURE, skip: "childAges" }] };
  }
  return null;
}

/** How many of the questions that apply are settled (answered or declined), for the progress line. */
export function progress(profile: Profile, skipped: readonly FlowField[]): { done: number; total: number } {
  const applicable: [FlowField, boolean][] = [
    ["currentState", Boolean(profile.currentState)],
    ["destinationState", Boolean(profile.destinationState)],
    ["moveDate", Boolean(profile.moveDate)],
    ["employment", Boolean(profile.employment)],
    ["insurance", Boolean(profile.insurance)],
    ["hasVehicle", profile.hasVehicle !== undefined],
  ];
  if (profile.hasVehicle !== true) applicable.push(["drives", profile.drives !== undefined]);
  applicable.push(["hasChildren", profile.hasChildren !== undefined]);
  if (profile.hasChildren === true) applicable.push(["childAges", Boolean(profile.childAges?.length)]);
  return { done: applicable.filter(([field, answered]) => answered || skipped.includes(field)).length, total: applicable.length };
}

const INCOME = { employee: "w2", self_employed: "1099", unemployed: "none" } as const;

/** Merge a patch into a profile, filling in what follows from it (a car means they drive, no kids means no ages). */
export function applyPatch(profile: Profile, patch: Partial<Profile>): Profile {
  const next: Profile = { ...profile, ...patch };
  if (patch.employment && patch.income === undefined && !profile.income) next.income = INCOME[patch.employment];
  if (patch.hasVehicle === true && patch.drives === undefined && profile.drives === undefined) next.drives = true;
  if (next.hasChildren === false) next.childAges = [];
  if (patch.childAges?.length && next.hasChildren === undefined) next.hasChildren = true;
  // A move inside one state has no interstate tasks: keep the state that was already there.
  if (next.currentState && next.currentState === next.destinationState) {
    if (patch.destinationState) next.destinationState = profile.destinationState;
    else if (patch.currentState) next.currentState = profile.currentState;
  }
  return next;
}

/** The fields that differ between two profiles, as a patch. */
export function diffPatch(before: Profile, after: Profile): Partial<Profile> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Profile)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key];
  }
  return patch as Partial<Profile>;
}

const EMPLOYMENT_TEXT = { employee: "Employee", self_employed: "Self-employed", unemployed: "Not working" } as const;
const INSURANCE_TEXT = { employer: "Employer plan", marketplace: "Marketplace plan", medicaid: "Medicaid", other: "Other insurance", none: "No insurance" } as const;

/** Short human labels for the fields a patch sets, e.g. "Moving to California". */
export function describePatch(patch: Partial<Profile>): { field: FlowField; text: string }[] {
  const out: { field: FlowField; text: string }[] = [];
  if (patch.currentState) out.push({ field: "currentState", text: `Moving from ${stateName(patch.currentState)}` });
  if (patch.destinationState) out.push({ field: "destinationState", text: `Moving to ${stateName(patch.destinationState)}` });
  if (patch.moveDate) out.push({ field: "moveDate", text: formatDate(patch.moveDate) });
  if (patch.employment) out.push({ field: "employment", text: EMPLOYMENT_TEXT[patch.employment] });
  if (patch.insurance) out.push({ field: "insurance", text: INSURANCE_TEXT[patch.insurance] });
  if (patch.hasVehicle !== undefined) out.push({ field: "hasVehicle", text: patch.hasVehicle ? "Bringing a vehicle" : "No vehicle" });
  if (patch.drives !== undefined && patch.hasVehicle !== true) out.push({ field: "drives", text: patch.drives ? "Will drive" : "Won't drive" });
  if (patch.hasChildren === false) out.push({ field: "hasChildren", text: "No children" });
  if (patch.childAges?.length) out.push({ field: "childAges", text: `Children aged ${patch.childAges.join(", ")}` });
  else if (patch.hasChildren === true) out.push({ field: "hasChildren", text: "Moving with children" });
  return out;
}

const SKIP = /\b(skip|not sure|don'?t know|dunno|no idea|later|prefer not|rather not|unsure)\b/i;
const NO = /\b(no|nope|nah|don'?t|do not|doesn'?t|without|never|none)\b/i;
const YES = /\b(yes|yeah|yep|yup|sure|i do|we do|have|bringing|will|correct)\b/i;

/**
 * Read a short answer to the question that was just asked, without a model.
 * Used when no AI key is set or the model is unavailable.
 */
export function answerFromRules(field: FlowField | null | undefined, text: string): { patch: Partial<Profile>; declined: FlowField[] } {
  const none = { patch: {}, declined: [] as FlowField[] };
  if (!field) return none;
  const t = text.trim();
  if (SKIP.test(t)) return { patch: {}, declined: [field] };
  switch (field) {
    case "hasVehicle":
      if (NO.test(t)) return { patch: { hasVehicle: false }, declined: [] };
      if (YES.test(t)) return { patch: { hasVehicle: true }, declined: [] };
      return none;
    case "drives":
      if (NO.test(t)) return { patch: { drives: false }, declined: [] };
      if (YES.test(t)) return { patch: { drives: true }, declined: [] };
      return none;
    case "hasChildren":
      if (NO.test(t)) return { patch: { hasChildren: false, childAges: [] }, declined: [] };
      if (YES.test(t)) return { patch: { hasChildren: true }, declined: [] };
      return none;
    case "childAges": {
      const ages = (t.match(/\b\d{1,2}\b/g) ?? []).map(Number).filter((n) => n <= 25);
      return ages.length ? { patch: { hasChildren: true, childAges: ages }, declined: [] } : none;
    }
    case "employment":
      if (/self[- ]?employed|freelanc|contractor|1099|own business/i.test(t)) return { patch: { employment: "self_employed", income: "1099" }, declined: [] };
      if (/unemploy|between jobs|not working|retired|student/i.test(t)) return { patch: { employment: "unemployed", income: "none" }, declined: [] };
      if (/employee|employed|full[- ]?time|part[- ]?time|w-?2|\bjob\b|salary/i.test(t)) return { patch: { employment: "employee", income: "w2" }, declined: [] };
      return none;
    case "insurance":
      if (/\bnone\b|no insurance|uninsured|not insured/i.test(t)) return { patch: { insurance: "none" }, declined: [] };
      if (/medicaid|medi-cal/i.test(t)) return { patch: { insurance: "medicaid" }, declined: [] };
      if (/marketplace|obamacare|\baca\b|healthcare\.gov|covered ?ca/i.test(t)) return { patch: { insurance: "marketplace" }, declined: [] };
      if (/employer|work|company|\bjob\b/i.test(t)) return { patch: { insurance: "employer" }, declined: [] };
      if (/other|private|cobra|parents?/i.test(t)) return { patch: { insurance: "other" }, declined: [] };
      return none;
    default:
      return none;
  }
}
