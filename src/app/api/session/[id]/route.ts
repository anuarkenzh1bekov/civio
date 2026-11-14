import { z } from "zod";
import { ProfileSchema } from "@/lib/profile-schema";
import { forecastSchema } from "@/lib/forecast/schema";
import { isSessionId, sessions } from "@/lib/server/sessions";

export const runtime = "nodejs";

/** What a session holds. Validated on every write, so the store never keeps arbitrary JSON. */
const SessionSchema = z
  .object({
    profile: ProfileSchema.extend({ forecast: forecastSchema.optional() }).refine(p => !p.forecast ||
      (p.forecast.origin === p.currentState && p.forecast.destination === p.destinationState)),
    done: z.array(z.string().max(64)).max(200),
    demo: z.boolean(),
    costs: z.record(z.string().max(64), z.number().min(-1_000_000).max(1_000_000)),
    pack: z.boolean(),
  })
  .strip();

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!isSessionId(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const row = sessions().get(id);
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(
    { session: JSON.parse(row.data), updatedAt: row.updatedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isSessionId(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 20_000) return Response.json({ error: "Too large." }, { status: 413 });
  let session: z.infer<typeof SessionSchema>;
  try {
    session = SessionSchema.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid session." }, { status: 400 });
  }
  const updatedAt = Date.now();
  sessions().put(id, JSON.stringify(session), updatedAt);
  return Response.json({ ok: true, updatedAt });
}
