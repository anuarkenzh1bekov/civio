import { buildDigest, dueReminders, type ReminderItem } from "@/lib/reminders";
import { RULES } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";
import type { Mail } from "@/lib/server/mail";
import type { Reminder } from "@/lib/server/reminders-store";
import type { Profile } from "@/lib/types";

export type RunDeps = {
  records: readonly Reminder[];
  loadSession: (sid: string) => Promise<{ profile: Profile; done: string[] } | null> | { profile: Profile; done: string[] } | null;
  send: (mail: Mail) => Promise<boolean>;
  save: (reminder: Reminder) => Promise<void> | void;
  today: string;
  origin: string;
  /** Work out what would be sent without sending or recording anything. */
  dry?: boolean;
};

export type RunResult = {
  checked: number;
  emailed: number;
  failed: number;
  /** Per subscription, only in a dry run: what would go out. Never includes the address. */
  preview?: { sid: string; items: Pick<ReminderItem, "taskId" | "title" | "dueDate" | "daysLeft">[] }[];
};

export const unsubscribeLink = (origin: string, token: string) => `${origin}/api/reminders/unsubscribe?token=${token}`;

/** Send today's reminders. The plan is recomputed from the stored session, so dates always match the app. */
export async function runReminders(deps: RunDeps): Promise<RunResult> {
  const result: RunResult = { checked: 0, emailed: 0, failed: 0, ...(deps.dry ? { preview: [] } : {}) };

  for (const record of deps.records) {
    if (record.status !== "confirmed" || !record.email) continue;
    result.checked++;
    const session = await deps.loadSession(record.sid);
    if (!session) continue;

    const plan = generatePlan(session.profile, RULES);
    const { items, mark } = dueReminders(plan, session.done, record.sent, deps.today);
    if (items.length === 0) continue;

    if (deps.dry) {
      result.preview?.push({ sid: record.sid, items: items.map(({ taskId, title, dueDate, daysLeft }) => ({ taskId, title, dueDate, daysLeft })) });
      continue;
    }

    const unsubscribe = unsubscribeLink(deps.origin, record.token);
    const digest = buildDigest(items, { plan: `${deps.origin}/dashboard?s=${record.sid}`, unsubscribe });
    let delivered = false;
    try {
      delivered = await deps.send({ to: record.email, ...digest, unsubscribeUrl: unsubscribe });
    } catch {
      delivered = false;
    }
    if (delivered) {
      // Recorded only after a successful send, so a failed run is retried by the next one.
      await deps.save({ ...record, sent: [...new Set([...record.sent, ...mark])] });
      result.emailed++;
    } else {
      result.failed++;
    }
  }
  return result;
}
