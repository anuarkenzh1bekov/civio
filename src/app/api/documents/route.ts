import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { aiProvider } from "@/lib/profile-schema";
import { GeminiError, geminiText } from "@/lib/server/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** The finished template letter, built in the browser from the user's own inputs. */
  letter: z.string().min(40).max(6000),
  /** What the user wants changed or added. */
  instructions: z.string().max(600).default(""),
});

const SYSTEM = `You edit short personal letters for people who are moving between US states: change-of-address letters, move-out notices, insurance update requests, school record requests.

You receive a complete draft built from a template, and sometimes a note from the writer about what to change. Return the full revised letter as plain text, ready to print, with nothing before or after it.

The draft's facts are the writer's own: names, addresses, dates, account references. Keep them exactly as written, and keep any [bracketed placeholder] as it is, because it marks something the writer still has to fill in. Work in details from the writer's note where they fit.

These letters go to banks, landlords and agencies, and the writer may rely on them later, so the letter should only say things the writer told you. Do not add legal claims, statute references, notice periods, deadlines or dollar amounts of your own; if the note asks for one, add a [bracketed placeholder] for the writer to fill in. Keep the tone plain and polite, and keep the letter to one page.`;

export type DocumentResponse = { letter: string; mode: "ai" | "template"; notice?: string };

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const template = (notice: string): Response =>
    Response.json({ letter: body.letter, mode: "template", notice } satisfies DocumentResponse);

  const provider = aiProvider();
  if (!provider) return template("AI tailoring is not configured here. This is the standard letter.");
  const prompt = `<draft>\n${body.letter}\n</draft>\n\n<note>\n${body.instructions.trim() || "No special requests. Tidy the wording."}\n</note>`;

  if (provider === "google") {
    try {
      const text = await geminiText({ system: SYSTEM, contents: [{ role: "user", parts: [{ text: prompt }] }], signal: request.signal });
      if (!text) return template("The AI model returned nothing. This is the standard letter.");
      return Response.json({ letter: text, mode: "ai" } satisfies DocumentResponse);
    } catch (error) {
      if (error instanceof GeminiError && error.kind === "auth") return template("The AI model's API key was rejected. This is the standard letter.");
      if (error instanceof GeminiError && error.kind === "rate_limit") return template("The AI model is busy. This is the standard letter.");
      if (error instanceof GeminiError && error.kind === "blocked") return template("The AI model declined this request. This is the standard letter.");
      console.error("documents error", error instanceof Error ? error.message : error);
      return template("The AI model could not be reached. This is the standard letter.");
    }
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create(
      {
        model: "claude-opus-5-5",
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      { signal: request.signal },
    );
    if (response.stop_reason === "refusal") return template("The AI model declined this request. This is the standard letter.");
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) return template("The AI model returned nothing. This is the standard letter.");
    return Response.json({ letter: text, mode: "ai" } satisfies DocumentResponse);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return template("The AI model's API key was rejected. This is the standard letter.");
    if (error instanceof Anthropic.RateLimitError) return template("The AI model is busy. This is the standard letter.");
    if (error instanceof Anthropic.APIError) console.error("documents API error", error.status, error.message);
    else console.error("documents error", error);
    return template("The AI model could not be reached. This is the standard letter.");
  }
}
