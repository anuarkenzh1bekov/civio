import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildContext, SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { retrieveRules, type Retrieved } from "@/lib/assistant/retrieve";
import { isStateCode } from "@/lib/states";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";

const state = z.string().refine(isStateCode).optional();

const ProfileSchema = z
  .object({
    currentState: state,
    destinationState: state,
    moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    employment: z.enum(["employee", "self_employed", "unemployed"]).optional(),
    income: z.enum(["w2", "1099", "both", "none"]).optional(),
    marital: z.enum(["single", "married", "divorced", "widowed"]).optional(),
    hasChildren: z.boolean().optional(),
    childAges: z.array(z.number().int().min(0).max(25)).max(12).optional(),
    insurance: z.enum(["employer", "marketplace", "medicaid", "other", "none"]).optional(),
    hasVehicle: z.boolean().optional(),
  })
  .strip();

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(24),
  /** Present only when the user allowed the assistant to read their profile. */
  profile: ProfileSchema.nullable().optional(),
});

export type AssistantSource = { ruleId: string; name: string; url: string; lastVerified: string; verified: boolean };

/** Newline-delimited JSON events sent to the browser. */
export type AssistantEvent =
  | { type: "sources"; sources: AssistantSource[]; mode: "ai" | "rules_only" }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

function toSources(retrieved: Retrieved[]): AssistantSource[] {
  const seen = new Set<string>();
  const sources: AssistantSource[] = [];
  for (const { rule } of retrieved) {
    if (seen.has(rule.source_url)) continue;
    seen.add(rule.source_url);
    sources.push({
      ruleId: rule.rule_id,
      name: rule.source_name,
      url: rule.source_url,
      lastVerified: rule.last_verified,
      verified: rule.verified,
    });
  }
  return sources;
}

/** Used when no API key is configured: the retrieved rules, stated as they are. */
function rulesOnlyAnswer(retrieved: Retrieved[]): string {
  if (retrieved.length === 0) {
    return "Civio doesn't have a verified rule for that question. The state agency or the IRS is the place to check.";
  }
  const top = retrieved.slice(0, 3);
  const parts = top.map(({ rule, task }) => {
    const t = rule.task_template;
    const deadline = task?.deadline ?? (t.deadline ? { label: t.deadline.label, date: undefined } : null);
    const lines = [`${task?.title ?? t.title}`, task?.description ?? t.description];
    if (deadline) lines.push(`Deadline: ${deadline.label}${deadline.date ? ` (${deadline.date})` : ""}.`);
    if (!rule.verified) lines.push("Civio has not verified this for your state. Check the official site.");
    return lines.join("\n");
  });
  return `These are the rules in Civio that match your question.\n\n${parts.join("\n\n")}`;
}

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const last = body.messages.at(-1);
  if (!last || last.role !== "user") {
    return Response.json({ error: "The last message must come from the user." }, { status: 400 });
  }

  const profile: Profile | null = body.profile ?? null;
  const retrieved = retrieveRules(last.content, profile);
  const sources = toSources(retrieved);
  const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      if (!hasCredentials) {
        send({ type: "sources", sources, mode: "rules_only" });
        send({ type: "text", delta: rulesOnlyAnswer(retrieved) });
        send({ type: "done" });
        controller.close();
        return;
      }

      send({ type: "sources", sources, mode: "ai" });
      try {
        const client = new Anthropic();
        const history = body.messages.slice(0, -1);
        const run = client.beta.messages.stream(
          {
            model: "claude-opus-5-5",
            max_tokens: 16000,
            thinking: { type: "adaptive" },
            output_config: { effort: "low" },
            // If a safety classifier declines, the API retries on a fallback model in the same call.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            messages: [
              ...history,
              // Retrieved rules and the profile ride with the question, after the cached prefix.
              { role: "user", content: `${buildContext(retrieved, profile)}\n\nQuestion: ${last.content}` },
            ],
          },
          { signal: request.signal },
        );
        run.on("text", (delta) => send({ type: "text", delta }));
        const final = await run.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ type: "error", message: "The assistant can't help with that request." });
        }
        send({ type: "done" });
      } catch (error) {
        if (request.signal.aborted) {
          // The browser went away; nothing to report.
        } else if (error instanceof Anthropic.AuthenticationError) {
          send({ type: "error", message: "The assistant's API key was rejected. Check ANTHROPIC_API_KEY." });
        } else if (error instanceof Anthropic.RateLimitError) {
          send({ type: "error", message: "The assistant is busy right now. Try again in a minute." });
        } else if (error instanceof Anthropic.APIError) {
          console.error("assistant API error", error.status, error.message);
          send({ type: "error", message: "The assistant couldn't answer. Your plan and its sources are unaffected." });
        } else {
          console.error("assistant error", error);
          send({ type: "error", message: "The assistant couldn't answer. Your plan and its sources are unaffected." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by an abort.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
