import type { Task } from "@/lib/types";

/**
 * Email reminders for deadlines. Everything here is plain code on the deterministic plan:
 * which task is due, when to nudge, and what the message says. No model is involved, so a
 * reminder can never state a date the rule engine did not compute.
 */

/** Days before a deadline when a reminder goes out. */
export const LEAD_DAYS = [7, 3, 1] as const;
/** A deadline missed by longer than this is not worth a late nag, and keeps new subscribers from a backlog. */
const OVERDUE_DAYS = 30;

export type ReminderItem = {
  taskId: string;
  title: string;
  dueDate: string;
  /** Days from today to the due date. Negative when overdue. */
  daysLeft: number;
  sourceName: string;
  sourceUrl: string;
  /** Marker stored once this reminder has been sent, so it is never sent twice. */
  key: string;
};

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function whenText(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft > 1) return `in ${daysLeft} days`;
  return daysLeft === -1 ? "1 day overdue" : `${-daysLeft} days overdue`;
}

/**
 * The reminders to send today for one plan. A task gets at most one reminder per run, the
 * closest milestone it has reached. Larger milestones are marked as sent with it, so a person
 * who joins with a deadline two days away gets one email, not three.
 */
export function dueReminders(
  tasks: readonly Task[],
  done: readonly string[],
  sent: readonly string[],
  today: string,
): { items: ReminderItem[]; mark: string[] } {
  const finished = new Set(done);
  const already = new Set(sent);
  const items: ReminderItem[] = [];
  const mark: string[] = [];

  for (const task of tasks) {
    const date = task.deadline?.date;
    if (!date || finished.has(task.id)) continue;
    const daysLeft = daysBetween(today, date);
    let key: string;
    let marks: string[];
    if (daysLeft >= 0) {
      const lead = Math.min(...LEAD_DAYS.filter((l) => daysLeft <= l));
      if (!Number.isFinite(lead)) continue;
      key = `${task.id}:${lead}`;
      marks = LEAD_DAYS.filter((l) => l >= lead).map((l) => `${task.id}:${l}`);
    } else if (daysLeft >= -OVERDUE_DAYS) {
      key = `${task.id}:overdue`;
      marks = [key, ...LEAD_DAYS.map((l) => `${task.id}:${l}`)];
    } else continue;
    if (already.has(key)) continue;
    items.push({ taskId: task.id, title: task.title, dueDate: date, daysLeft, sourceName: task.source.name, sourceUrl: task.source.url, key });
    mark.push(...marks);
  }
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return { items, mark };
}

/** What the person will be reminded about next, for the preview before and after subscribing. */
export function upcomingReminders(
  tasks: readonly Task[],
  done: readonly string[],
  today: string,
  limit = 3,
): { taskId: string; title: string; dueDate: string; remindOn: string[] }[] {
  const finished = new Set(done);
  return tasks
    .filter((t) => t.deadline?.date && !finished.has(t.id) && daysBetween(today, t.deadline.date) >= 0)
    .sort((a, b) => (a.deadline!.date! < b.deadline!.date! ? -1 : 1))
    .slice(0, limit)
    .map((t) => {
      const due = t.deadline!.date!;
      const remindOn = LEAD_DAYS.map((l) => addDays(due, -l)).filter((d) => d >= today);
      return { taskId: t.id, title: t.title, dueDate: due, remindOn };
    });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Digest = { subject: string; text: string; html: string };

/** One email for everything that is due today. Links: the plan, each rule's official source, and unsubscribe. */
export function buildDigest(items: readonly ReminderItem[], links: { plan: string; unsubscribe: string }): Digest {
  const first = items[0];
  const subject =
    items.length === 1 && first
      ? first.daysLeft < 0
        ? `Civio: "${first.title}" is overdue`
        : `Civio: "${first.title}" is due ${whenText(first.daysLeft)}`
      : `Civio: ${items.length} deadlines need your attention`;

  const text = [
    "Deadlines from your Civio plan:",
    "",
    ...items.map((i) => `- ${i.title}: ${formatDay(i.dueDate)} (${whenText(i.daysLeft)})\n  Official source: ${i.sourceName} ${i.sourceUrl}`),
    "",
    `Open your plan: ${links.plan}`,
    "",
    "You get this because you turned on deadline reminders. Dates come from the rules in your plan.",
    `Unsubscribe: ${links.unsubscribe}`,
  ].join("\n");

  const rows = items
    .map((i) => {
      const late = i.daysLeft < 0;
      return `<tr><td style="padding:14px 0;border-top:1px solid #e5e5e5">
<div style="font-weight:600;font-size:16px">${esc(i.title)}</div>
<div style="margin-top:2px;color:${late ? "#b42318" : "#444"}">${esc(formatDay(i.dueDate))} · ${esc(whenText(i.daysLeft))}</div>
<div style="margin-top:4px;font-size:13px"><a href="${esc(i.sourceUrl)}" style="color:#1a56db">${esc(i.sourceName)}</a></div>
</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:16px;padding:24px">
<div style="font-size:13px;color:#666;letter-spacing:.04em;text-transform:uppercase">Civio</div>
<h1 style="margin:6px 0 12px;font-size:22px">Deadlines from your plan</h1>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
<p style="margin:20px 0 0"><a href="${esc(links.plan)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Open your plan</a></p>
</div>
<p style="font-size:12px;color:#777;margin:16px 4px">You get this because you turned on deadline reminders. Dates come from the rules in your plan. <a href="${esc(links.unsubscribe)}" style="color:#777">Unsubscribe</a></p>
</div></body></html>`;

  return { subject, text, html };
}

export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

/** The confirmation email: nothing is sent until the person follows this link, so nobody can enrol someone else's address. */
export function buildConfirmation(links: { confirm: string; unsubscribe: string }): Digest {
  const text = [
    "Confirm your Civio deadline reminders.",
    "",
    "Someone asked for emails about the deadlines in a Civio moving plan to be sent to this address.",
    `If that was you, confirm here: ${links.confirm}`,
    "",
    "If it was not you, ignore this message and nothing will be sent.",
    `Unsubscribe: ${links.unsubscribe}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:16px;padding:24px">
<div style="font-size:13px;color:#666;letter-spacing:.04em;text-transform:uppercase">Civio</div>
<h1 style="margin:6px 0 12px;font-size:22px">Confirm your deadline reminders</h1>
<p>Someone asked for emails about the deadlines in a Civio moving plan to be sent to this address. If that was you, confirm below.</p>
<p style="margin:20px 0"><a href="${esc(links.confirm)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Confirm reminders</a></p>
<p style="color:#666;font-size:13px">If it was not you, ignore this message and nothing will be sent.</p>
</div><p style="font-size:12px;color:#777;margin:16px 4px"><a href="${esc(links.unsubscribe)}" style="color:#777">Unsubscribe</a></p></div></body></html>`;
  return { subject: "Confirm your Civio deadline reminders", text, html };
}
