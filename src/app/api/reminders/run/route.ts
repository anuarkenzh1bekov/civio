import { timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/server/app-url";
import { sendMail } from "@/lib/server/mail";
import { runReminders } from "@/lib/server/reminder-run";
import { reminders } from "@/lib/server/reminders-store";
import { sessions } from "@/lib/server/sessions";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Daily job: email whoever has a deadline reaching a reminder point today. A scheduler calls it
 * with `Authorization: Bearer $CRON_SECRET` (Vercel Cron does this by itself). `?dry=1` lists
 * what would be sent without sending. Without CRON_SECRET the endpoint is closed.
 */
async function handle(request: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: "Reminders are not scheduled on this server." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const store = reminders();
  const result = await runReminders({
    records: await store.all(),
    async loadSession(sid) {
      const row = await sessions().get(sid);
      if (!row) return null;
      const data = JSON.parse(row.data) as { profile: Profile; done: string[] };
      return { profile: data.profile, done: data.done };
    },
    send: sendMail,
    save: (record) => store.put(record),
    today: new Date().toISOString().slice(0, 10),
    origin: appOrigin(request),
    dry: new URL(request.url).searchParams.get("dry") === "1",
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
