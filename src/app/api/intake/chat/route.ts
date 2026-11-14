import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ChatExtraction, CHAT_SYSTEM, GEMINI_CHAT_SCHEMA, toResult } from "@/lib/intake/extract";
import { answerFromRules, describePatch, FLOW_FIELDS, type FlowField } from "@/lib/intake/flow";
import { parseIntake, type IntakeResult } from "@/lib/intake/parse";
import { aiProvider, ProfileSchema } from "@/lib/profile-schema";
import { GeminiError, geminiText, type GeminiPart } from "@/lib/server/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(12),
  /** The profile so far, as the form holds it. */
  profile: ProfileSchema.default({}),
  /** The field the last question was about, so "yes" or "no" has a meaning. */
  asking: z.enum(FLOW_FIELDS as [FlowField, ...FlowField[]]).nullable().optional(),
  image: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      data: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+=*$/),
    })
    .optional(),
});

export type ChatIntakeResponse = IntakeResult & {
  declined: FlowField[];
  mode: "ai" | "rules_only";
  notice?: string;
};

const isField = (value: string): value is FlowField => (FLOW_FIELDS as readonly string[]).includes(value);

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Send a message." }, { status: 400 });
  }
  const latest = body.messages.at(-1);
  if (latest?.role !== "user" || (latest.content.trim() === "" && !body.image)) {
    return Response.json({ error: "Send a message." }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const text = latest.content.trim();

  /** Built-in rules: the whole text through the free-text parser, plus the short answer to the open question. */
  const fallback = (notice?: string): Response => {
    const whole = parseIntake(text, today);
    const short = answerFromRules(body.asking, text);
    const patch = { ...whole.profile, ...short.patch };
    const found = [...whole.found];
    for (const item of describePatch(short.patch)) {
      if (!found.some((f) => f.field === item.field)) found.push({ field: item.field, label: item.text, value: item.text, from: "your answer" });
    }
    return Response.json({ profile: patch, found, declined: short.declined, mode: "rules_only", notice } satisfies ChatIntakeResponse);
  };

  const provider = aiProvider();
  if (!provider) return fallback();

  const recent = body.messages.slice(-6).map((m) => `${m.role === "user" ? "Person" : "Civio"}: ${m.content}`).join("\n");
  const prompt = [
    `Today's date: ${today}`,
    `Profile so far: ${JSON.stringify(body.profile)}`,
    `The last question was about: ${body.asking ?? "nothing in particular"}`,
    `Recent messages:\n${recent}`,
    body.image ? "The person attached a photo of a document; read it as well." : "",
  ].filter(Boolean).join("\n\n");

  const result = (extraction: z.infer<typeof ChatExtraction>): Response => {
    const declined = extraction.declined.filter(isField);
    return Response.json({ ...toResult(extraction), declined, mode: "ai" } satisfies ChatIntakeResponse);
  };

  if (provider === "google") {
    const parts: GeminiPart[] = [];
    if (body.image) parts.push({ inlineData: { mimeType: body.image.mediaType, data: body.image.data } });
    parts.push({ text: prompt });
    try {
      const raw = await geminiText({
        system: CHAT_SYSTEM,
        contents: [{ role: "user", parts }],
        jsonSchema: GEMINI_CHAT_SCHEMA,
        maxOutputTokens: 1500,
        signal: request.signal,
      });
      const extraction = ChatExtraction.safeParse(JSON.parse(raw));
      if (!extraction.success) return fallback("The AI model's answer could not be used, so built-in rules read it.");
      return result(extraction.data);
    } catch (error) {
      if (error instanceof GeminiError && error.kind === "rate_limit") return fallback("The AI model is busy, so built-in rules read it.");
      if (error instanceof GeminiError && error.kind === "auth") return fallback("The AI model's API key was rejected, so built-in rules read it.");
      console.error("intake chat error", error instanceof Error ? error.message : error);
      return fallback("The AI model could not read this, so built-in rules read it.");
    }
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (body.image) content.push({ type: "image", source: { type: "base64", media_type: body.image.mediaType, data: body.image.data } });
  content.push({ type: "text", text: prompt });
  try {
    const response = await new Anthropic().messages.parse(
      {
        model: "claude-opus-5-5",
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(ChatExtraction) },
        system: CHAT_SYSTEM,
        messages: [{ role: "user", content }],
      },
      { signal: request.signal },
    );
    if (response.stop_reason === "refusal" || !response.parsed_output) return fallback("The AI model could not read this, so built-in rules read it.");
    return result(response.parsed_output);
  } catch (error) {
    console.error("intake chat error", error instanceof Anthropic.APIError ? error.status : error);
    return fallback("The AI model could not be reached, so built-in rules read it.");
  }
}
