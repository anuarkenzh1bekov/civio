import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Outgoing email. With RESEND_API_KEY and MAIL_FROM set, mail goes through Resend's HTTP API.
 * Without them, a development server writes each message to `.data/outbox/` instead (nothing
 * is sent), and a production server reports mail as off rather than pretending to deliver.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** One-click unsubscribe target, sent as the List-Unsubscribe header. */
  unsubscribeUrl?: string;
};

export type MailMode = "resend" | "outbox" | "off";

export function mailMode(): MailMode {
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "resend";
  return process.env.NODE_ENV === "production" ? "off" : "outbox";
}

/** True when the message was handed to a provider (or written to the dev outbox). */
export async function sendMail(mail: Mail): Promise<boolean> {
  const mode = mailMode();
  if (mode === "off") return false;

  if (mode === "outbox") {
    const dir = path.join(process.cwd(), ".data", "outbox");
    mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    writeFileSync(path.join(dir, name), JSON.stringify(mail, null, 2));
    console.info(`[mail:outbox] ${name} "${mail.subject}"`);
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.unsubscribeUrl
          ? { headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.error("mail error", response.status);
    return response.ok;
  } catch (error) {
    console.error("mail error", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
