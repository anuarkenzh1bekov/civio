/**
 * Google Gemini over its REST API (no SDK dependency). Used when
 * GOOGLE_API_KEY is set; the model can be changed with GEMINI_MODEL.
 * The key is sent in a header and never appears in a URL or a log line.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const model = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type GeminiRequest = {
  system: string;
  contents: GeminiContent[];
  /** When set, the reply is JSON that matches this schema (Gemini's OpenAPI subset). */
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

/** Why a call produced no usable text. `status` is the HTTP status, when there was one. */
export class GeminiError extends Error {
  constructor(
    readonly kind: "auth" | "rate_limit" | "blocked" | "api",
    readonly status?: number,
  ) {
    super(`Gemini ${kind}${status ? ` (${status})` : ""}`);
  }
}

type Chunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const BLOCKED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

function body(request: GeminiRequest): string {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.contents,
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens ?? 4000,
      ...(request.jsonSchema ? { responseMimeType: "application/json", responseSchema: request.jsonSchema } : {}),
    },
  });
}

async function call(method: string, request: GeminiRequest): Promise<Response> {
  const response = await fetch(`${BASE}/${model()}:${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GOOGLE_API_KEY ?? "" },
    body: body(request),
    signal: request.signal,
  });
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403) throw new GeminiError("auth", response.status);
  if (response.status === 429) throw new GeminiError("rate_limit", response.status);
  throw new GeminiError("api", response.status);
}

/** Visible text of a chunk. Throws when the model or its filters declined. */
function textOf(chunk: Chunk): string {
  if (chunk.promptFeedback?.blockReason) throw new GeminiError("blocked");
  const candidate = chunk.candidates?.[0];
  if (candidate?.finishReason && BLOCKED.has(candidate.finishReason)) throw new GeminiError("blocked");
  return (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** One complete reply. */
export async function geminiText(request: GeminiRequest): Promise<string> {
  const response = await call("generateContent", request);
  return textOf((await response.json()) as Chunk).trim();
}

/** A reply as it is written, piece by piece. */
export async function* geminiStream(request: GeminiRequest): AsyncGenerator<string> {
  const response = await call("streamGenerateContent?alt=sse", request);
  if (!response.body) throw new GeminiError("api");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const text = textOf(JSON.parse(line.slice(5)) as Chunk);
      if (text) yield text;
    }
  }
}
