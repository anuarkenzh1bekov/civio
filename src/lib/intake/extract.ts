import { z } from "zod";
import type { IntakeResult } from "@/lib/intake/parse";
import { ProfileSchema } from "@/lib/profile-schema";
import { US_STATES } from "@/lib/states";
import type { Profile } from "@/lib/types";

/** What the model must return. Every field is required and nullable: null means "not stated". */
export const Extraction = z.object({
  currentState: z.string().nullable().describe("Two-letter USPS code of the state the person lives in now"),
  destinationState: z.string().nullable().describe("Two-letter USPS code of the state they are moving to"),
  moveDate: z.string().nullable().describe("Move date as yyyy-mm-dd"),
  zip: z.string().nullable().describe("5-digit ZIP code of the new address"),
  employment: z.enum(["employee", "self_employed", "unemployed"]).nullable(),
  income: z.enum(["w2", "1099", "both", "none"]).nullable(),
  marital: z.enum(["single", "married", "divorced", "widowed"]).nullable(),
  hasChildren: z.boolean().nullable(),
  childAges: z.array(z.number()).nullable(),
  insurance: z.enum(["employer", "marketplace", "medicaid", "other", "none"]).nullable(),
  hasVehicle: z.boolean().nullable(),
  drives: z.boolean().nullable().describe("True when the person will drive after the move"),
  vehicleRegisteredInCurrentState: z.boolean().nullable(),
  evidence: z
    .array(z.object({ field: z.string(), quote: z.string() }))
    .describe("For each non-null field: the field name and the few words or the document detail it was read from"),
});

/** The chat adds one list: the questions the person declined to answer. */
export const ChatExtraction = Extraction.extend({
  declined: z.array(z.string()).describe("Names of fields the person said they do not know or do not want to answer"),
});

/** The same shape for Gemini, which takes an OpenAPI-style schema. */
const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type, nullable: true, ...extra });
export const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    currentState: nullable("STRING", { description: "Two-letter USPS code of the state the person lives in now" }),
    destinationState: nullable("STRING", { description: "Two-letter USPS code of the state they are moving to" }),
    moveDate: nullable("STRING", { description: "Move date as yyyy-mm-dd" }),
    zip: nullable("STRING", { description: "5-digit ZIP code of the new address" }),
    employment: nullable("STRING", { enum: ["employee", "self_employed", "unemployed"] }),
    income: nullable("STRING", { enum: ["w2", "1099", "both", "none"] }),
    marital: nullable("STRING", { enum: ["single", "married", "divorced", "widowed"] }),
    hasChildren: nullable("BOOLEAN"),
    childAges: nullable("ARRAY", { items: { type: "INTEGER" } }),
    insurance: nullable("STRING", { enum: ["employer", "marketplace", "medicaid", "other", "none"] }),
    hasVehicle: nullable("BOOLEAN"),
    drives: nullable("BOOLEAN", { description: "True when the person will drive after the move" }),
    vehicleRegisteredInCurrentState: nullable("BOOLEAN"),
    evidence: {
      type: "ARRAY",
      description: "For each non-null field: the field name and the few words or the document detail it was read from",
      items: { type: "OBJECT", properties: { field: { type: "STRING" }, quote: { type: "STRING" } }, required: ["field", "quote"] },
    },
  },
  required: [
    "currentState", "destinationState", "moveDate", "zip", "employment", "income", "marital", "hasChildren",
    "childAges", "insurance", "hasVehicle", "drives", "vehicleRegisteredInCurrentState", "evidence",
  ],
};

export const GEMINI_CHAT_SCHEMA = {
  ...GEMINI_SCHEMA,
  properties: {
    ...GEMINI_SCHEMA.properties,
    declined: {
      type: "ARRAY",
      description: "Names of fields the person said they do not know or do not want to answer",
      items: { type: "STRING" },
    },
  },
  required: [...GEMINI_SCHEMA.required, "declined"],
};

const STATE_BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

export const SYSTEM = `You turn a person's description of a move between US states into a structured profile for Civio, a moving checklist app. The input is free text in any language, a photo of a document (driver license, insurance card, lease, vehicle registration), or both.

A rule engine uses this profile to decide which legal deadlines apply, and the person reviews every field before it is saved. A field you fill in without support produces a wrong task, while a field you leave null simply becomes a question the app asks. So fill a field only when the text or the document states it or clearly implies it, and return null otherwise.

Reading notes:
- Cities map to their state (Austin is TX). States are two-letter USPS codes.
- A date without a year means its next occurrence after today's date, which is given in the request.
- From a document, use only what it shows: a driver license shows the current state; a lease shows the new address (ZIP, destination state) and its start date is a reasonable move date; an insurance card shows the kind of coverage; a vehicle registration means they own a vehicle and shows where it is registered.
- "1099", freelance or contract work means self_employed with income "1099"; use "both" only when a regular job is mentioned too.
- "drives" is true when the person says they drive or will drive after the move; a person bringing a car drives.
- Do not copy names, license numbers, policy numbers or street addresses into any field or into evidence. Evidence is a short phrase such as "lease start date" or the words the person wrote.`;

/** The guided chat reads one reply at a time, in the context of the question that was just asked. */
export const CHAT_SYSTEM = `${SYSTEM}

This is a guided conversation. The app asks one question at a time and the person answers it, usually briefly ("yes", "self-employed", "two kids, 4 and 9"), though they may also tell you several things at once. The request gives the profile so far, the field the last question was about ("asking"), and the recent messages.
- A short answer belongs to the field in "asking". "Yes" or "no" to a question about a vehicle sets hasVehicle, not another field.
- Return only what the latest message adds. Never repeat fields that are already in the profile unless the person corrects them.
- If the person says they do not know, would rather not say, or want to skip, put the field name from "asking" in declined and leave it null.
- Questions from the person (not answers) set nothing.`;

export const LABELS = {
  currentState: "Moving from",
  destinationState: "Moving to",
  moveDate: "Move date",
  zip: "New ZIP code",
  employment: "Employment",
  income: "Income type",
  marital: "Marital status",
  hasChildren: "Children",
  childAges: "Children's ages",
  insurance: "Health insurance",
  hasVehicle: "Vehicle",
  drives: "Drives",
  vehicleRegisteredInCurrentState: "Vehicle registered in current state",
} as const satisfies Partial<Record<keyof Profile, string>>;

type Field = keyof typeof LABELS;

/** Model output goes through the same schema as any other profile; what fails is dropped, field by field. */
export function toResult(extraction: z.infer<typeof Extraction>): IntakeResult {
  const profile: Partial<Profile> = {};
  const found: IntakeResult["found"] = [];
  const quotes = new Map(extraction.evidence.map((item) => [item.field, item.quote.slice(0, 80)]));
  for (const key of Object.keys(LABELS) as Field[]) {
    let value: unknown = extraction[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && (key === "currentState" || key === "destinationState")) {
      // A model sometimes writes the state's name instead of its code.
      value = STATE_BY_NAME.get(value.trim().toLowerCase()) ?? value.trim().toUpperCase();
    }
    const checked = ProfileSchema.safeParse({ [key]: value });
    if (!checked.success) continue;
    Object.assign(profile, checked.data);
    const shown = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    found.push({ field: key, label: LABELS[key], value: shown, from: quotes.get(key) ?? "" });
  }
  return { profile, found };
}
