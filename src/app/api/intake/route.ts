import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { parseIntake, type IntakeResult } from "@/lib/intake/parse";
import { aiProvider, ProfileSchema } from "@/lib/profile-schema";
import { GeminiError, geminiText, type GeminiPart } from "@/lib/server/gemini";
import { US_STATES } from "@/lib/states";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    text: z.string().max(4000).default(""),
    image: z
      .object({
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        /** Base64 without the data: prefix. About 5 MB of image at most. */
        data: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+=*$/),
      })
      .optional(),
  })
  .refine((body) => body.text.trim() !== "" || body.image, { message: "Nothing to read." });

/** What the model must return. Every field is required and nullable: null means "not stated". */
const Extraction = z.object({
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
  vehicleRegisteredInCurrentState: z.boolean().nullable(),
  evidence: z
    .array(z.object({ field: z.string(), quote: z.string() }))
    .describe("For each non-null field: the field name and the few words or the document detail it was read from"),
});

/** The same shape for Gemini, which takes an OpenAPI-style schema. */
const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type, nullable: true, ...extra });
const GEMINI_SCHEMA = {
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
    vehicleRegisteredInCurrentState: nullable("BOOLEAN"),
    evidence: {
      type: "ARRAY",
      description: "For each non-null field: the field name and the few words or the document detail it was read from",
      items: { type: "OBJECT", properties: { field: { type: "STRING" }, quote: { type: "STRING" } }, required: ["field", "quote"] },
    },
  },
  required: [
    "currentState", "destinationState", "moveDate", "zip", "employment", "income", "marital", "hasChildren",
    "childAges", "insurance", "hasVehicle", "vehicleRegisteredInCurrentState", "evidence",
  ],
};

const STATE_BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

const SYSTEM = `You turn a person's description of a move between US states into a structured profile for Civio, a moving checklist app. The input is free text in any language, a photo of a document (driver license, insurance card, lease, vehicle registration), or both.

A rule engine uses this profile to decide which legal deadlines apply, and the person reviews every field before it is saved. A field you fill in without support produces a wrong task, while a field you leave null simply becomes a question the app asks. So fill a field only when the text or the document states it or clearly implies it, and return null otherwise.

Reading notes:
- Cities map to their state (Austin is TX). States are two-letter USPS codes.
- A date without a year means its next occurrence after today's date, which is given in the request.
- From a document, use only what it shows: a driver license shows the current state; a lease shows the new address (ZIP, destination state) and its start date is a reasonable move date; an insurance card shows the kind of coverage; a vehicle registration means they own a vehicle and shows where it is registered.
- "1099", freelance or contract work means self_employed with income "1099"; use "both" only when a regular job is mentioned too.
- Do not copy names, license numbers, policy numbers or street addresses into any field or into evidence. Evidence is a short phrase such as "lease start date" or the words the person wrote.`;

const LABELS = {
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
  vehicleRegisteredInCurrentState: "Vehicle registered in current state",
} as const satisfies Partial<Record<keyof Profile, string>>;

type Field = keyof typeof LABELS;

/** Model output goes through the same schema as any other profile; what fails is dropped, field by field. */
function toResult(extraction: z.infer<typeof Extraction>): IntakeResult {
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

export type IntakeResponse = IntakeResult & { mode: "ai" | "rules_only"; notice?: string };

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Send a description of your move or a photo of a document." }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const fallback = (notice?: string): Response =>
    Response.json({ ...parseIntake(body.text, today), mode: "rules_only", notice } satisfies IntakeResponse);

  const provider = aiProvider();
  if (!provider) {
    return fallback(
      body.image ? "Reading a photo needs the AI model, which is not configured here. Only the text was read." : undefined,
    );
  }

  const prompt = `Today's date: ${today}\n\nDescription:\n${body.text.trim() || "(none, read the attached document)"}`;

  if (provider === "google") {
    const parts: GeminiPart[] = [];
    if (body.image) parts.push({ inlineData: { mimeType: body.image.mediaType, data: body.image.data } });
    parts.push({ text: prompt });
    try {
      const raw = await geminiText({ system: SYSTEM, contents: [{ role: "user", parts }], jsonSchema: GEMINI_SCHEMA, signal: request.signal });
      const extraction = Extraction.safeParse(JSON.parse(raw));
      if (!extraction.success) return fallback("The AI model's answer could not be used. The text was read with built-in rules instead.");
      return Response.json({ ...toResult(extraction.data), mode: "ai" } satisfies IntakeResponse);
    } catch (error) {
      if (error instanceof GeminiError && error.kind === "auth") {
        return fallback("The AI model's API key was rejected. The text was read with built-in rules instead.");
      }
      if (error instanceof GeminiError && error.kind === "rate_limit") {
        return fallback("The AI model is busy. The text was read with built-in rules instead.");
      }
      console.error("intake error", error instanceof Error ? error.message : error);
      return fallback("The AI model could not read this. The text was read with built-in rules instead.");
    }
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.image) {
    content.push({ type: "image", source: { type: "base64", media_type: body.image.mediaType, data: body.image.data } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const client = new Anthropic();
    const response = await client.messages.parse(
      {
        model: "claude-opus-5-5",
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(Extraction) },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      },
      { signal: request.signal },
    );
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return fallback("The AI model could not read this. The text was read with built-in rules instead.");
    }
    return Response.json({ ...toResult(response.parsed_output), mode: "ai" } satisfies IntakeResponse);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return fallback("The AI model's API key was rejected. The text was read with built-in rules instead.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fallback("The AI model is busy. The text was read with built-in rules instead.");
    }
    if (error instanceof Anthropic.APIError) console.error("intake API error", error.status, error.message);
    else console.error("intake error", error);
    return fallback("The AI model could not be reached. The text was read with built-in rules instead.");
  }
}
