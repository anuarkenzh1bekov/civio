import { appOrigin } from "@/lib/server/app-url";
import { reminders } from "@/lib/server/reminders-store";

export const runtime = "nodejs";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#111"><h1 style="font-size:1.5rem">${title}</h1><p style="color:#444">${body}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** The link in the confirmation email. Opens the plan again with reminders switched on. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const store = reminders();
  const record = token.length >= 16 ? store.byToken(token) : null;
  if (!record || record.status === "unsubscribed" || !record.email) {
    return page("This link is no longer valid", "Turn reminders on again from your plan to get a new confirmation email.", 404);
  }
  if (record.status !== "confirmed") store.put({ ...record, status: "confirmed", confirmedAt: Date.now() });
  return Response.redirect(`${appOrigin(request)}/dashboard?s=${record.sid}&reminders=confirmed`, 302);
}
