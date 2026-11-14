import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Extraction, GEMINI_SCHEMA, SYSTEM, toResult } from "@/lib/intake/extract";
import { parseIntake, type IntakeResult } from "@/lib/intake/parse";
import { aiProvider } from "@/lib/profile-schema";
import { GeminiError, geminiText, type GeminiPart } from "@/lib/server/gemini";

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
