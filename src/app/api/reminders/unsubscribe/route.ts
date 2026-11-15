import { z } from "zod";
import { reminders } from "@/lib/server/reminders-store";
import { isSessionId } from "@/lib/server/sessions";

export const runtime = "nodejs";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#111"><h1 style="font-size:1.5rem">${title}</h1><p style="color:#444">${body}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** Switch reminders off and drop the address. The record stays so old links keep saying "unsubscribed". */
async function unsubscribe(by: { token?: string; sid?: string }): Promise<boolean> {
  const store = reminders();
  const record = by.token && by.token.length >= 16 ? await store.byToken(by.token) : by.sid && isSessionId(by.sid) ? await store.get(by.sid) : null;
  if (!record) return false;
  await store.put({ ...record, status: "unsubscribed", email: "" });
  return true;
}

/** The link at the bottom of every email. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return (await unsubscribe({ token }))
    ? page("You are unsubscribed", "Civio will not email you about deadlines. Your plan is unchanged, and you can turn reminders on again from it.")
    : page("This link is no longer valid", "Nothing is scheduled for this address.", 404);
}

/** One-click unsubscribe from mail apps (token in the URL), and the "turn off" button in the app (session id in the body). */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? undefined;
  const body = z.object({ sid: z.string() }).safeParse(await request.json().catch(() => null));
  const ok = await unsubscribe({ token, sid: body.success ? body.data.sid : undefined });
  return Response.json({ ok }, { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
