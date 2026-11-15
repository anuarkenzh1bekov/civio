import { randomBytes } from "node:crypto";
import { z } from "zod";
import { buildConfirmation, maskEmail } from "@/lib/reminders";
import { appOrigin } from "@/lib/server/app-url";
import { mailMode, sendMail, type MailMode } from "@/lib/server/mail";
import { unsubscribeLink } from "@/lib/server/reminder-run";
import { reminders } from "@/lib/server/reminders-store";
import { isSessionId, sessions } from "@/lib/server/sessions";

export const runtime = "nodejs";

const RESEND_AFTER_MS = 60_000;

const BodySchema = z.object({
  sid: z.string(),
  email: z.string().trim().toLowerCase().email().max(254),
  /** The person ticked the box that says what the emails are. */
  consent: z.literal(true),
});

export type ReminderStatus = {
  mode: MailMode;
  status: "none" | "pending" | "confirmed";
  /** Masked, e.g. j***@gmail.com. The full address is never sent back. */
  email?: string;
  /** Development only, when mail goes to the outbox: the link that would have been emailed. */
  devConfirmUrl?: string;
};

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const sid = new URL(request.url).searchParams.get("sid") ?? "";
  const mode = mailMode();
  const record = isSessionId(sid) ? await reminders().get(sid) : null;
  const status: ReminderStatus["status"] = record?.status === "confirmed" || record?.status === "pending" ? record.status : "none";
  return Response.json(
    { mode, status, ...(record && status !== "none" ? { email: maskEmail(record.email) } : {}) } satisfies ReminderStatus,
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email and tick the box to agree." }, { status: 400 });
  const { sid, email } = parsed.data;
  if (!isSessionId(sid) || !(await sessions().get(sid))) {
    return Response.json({ error: "Open your plan first, then turn reminders on." }, { status: 404 });
  }
  const mode = mailMode();
  if (mode === "off") return Response.json({ error: "Email is not set up on this server." }, { status: 503 });

  const store = reminders();
  const existing = await store.get(sid);
  if (existing?.status === "confirmed" && existing.email === email) {
    return Response.json({ mode, status: "confirmed", email: maskEmail(email) } satisfies ReminderStatus);
  }
  if (existing && Date.now() - existing.confirmSentAt < RESEND_AFTER_MS) {
    return Response.json({ error: "A confirmation email was just sent. Wait a minute before asking again." }, { status: 429 });
  }

  const origin = appOrigin(request);
  const token = randomBytes(24).toString("base64url");
  const confirm = `${origin}/api/reminders/confirm?token=${token}`;
  const unsubscribe = unsubscribeLink(origin, token);
  const mail = buildConfirmation({ confirm, unsubscribe });
  const delivered = await sendMail({ to: email, ...mail, unsubscribeUrl: unsubscribe });
  if (!delivered) return Response.json({ error: "The confirmation email could not be sent. Try again later." }, { status: 502 });

  const now = Date.now();
  await store.put({ sid, email, status: "pending", token, createdAt: existing?.createdAt ?? now, confirmSentAt: now, sent: existing?.sent ?? [] });
  return Response.json(
    {
      mode,
      status: "pending",
      email: maskEmail(email),
      // Only where mail is not really sent. Returning it in production would let anyone confirm any address.
      ...(mode === "outbox" ? { devConfirmUrl: confirm } : {}),
    } satisfies ReminderStatus,
    { headers: noStore },
  );
}
