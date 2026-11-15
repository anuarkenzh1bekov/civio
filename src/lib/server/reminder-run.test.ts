import { describe, expect, it } from "vitest";
import { DEMO_PROFILE } from "@/lib/demo";
import type { Mail } from "@/lib/server/mail";
import { runReminders } from "./reminder-run";
import type { Reminder } from "./reminders-store";

const record = (over: Partial<Reminder> = {}): Reminder => ({
  sid: "sid-1", email: "jordan@example.com", status: "confirmed", token: "t".repeat(32), createdAt: 0, confirmSentAt: 0, sent: [], ...over,
});

function setup(records: Reminder[], opts: { fail?: boolean; done?: string[] } = {}) {
  const sent: Mail[] = [];
  const saved: Reminder[] = [];
  const deps = {
    records,
    loadSession: () => ({ profile: DEMO_PROFILE, done: opts.done ?? [] }),
    send: async (mail: Mail) => {
      if (opts.fail) return false;
      sent.push(mail);
      return true;
    },
    save: (r: Reminder) => saved.push(r),
    today: "2027-02-01", // three days before the 20-day vehicle registration deadline of a Jan 15 move
    origin: "https://civio.test",
  };
  return { deps, sent, saved };
}

describe("runReminders", () => {
  it("emails a confirmed subscriber once, with their plan and unsubscribe link, and records what it sent", async () => {
    const { deps, sent, saved } = setup([record()]);
    const result = await runReminders(deps);
    expect(result).toMatchObject({ checked: 1, emailed: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("jordan@example.com");
    expect(sent[0]?.text).toContain("https://civio.test/dashboard?s=sid-1");
    expect(sent[0]?.unsubscribeUrl).toBe(`https://civio.test/api/reminders/unsubscribe?token=${"t".repeat(32)}`);
    expect(saved[0]?.sent.length).toBeGreaterThan(0);

    // The next run with the saved markers sends nothing.
    const again = await runReminders({ ...deps, records: saved });
    expect(again.emailed).toBe(0);
  });

  it("ignores pending and unsubscribed subscriptions", async () => {
    const { deps, sent } = setup([record({ status: "pending" }), record({ sid: "sid-2", status: "unsubscribed", email: "" })]);
    expect((await runReminders(deps)).checked).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("does not mark anything as sent when delivery fails, so the next run retries", async () => {
    const { deps, saved } = setup([record()], { fail: true });
    const result = await runReminders(deps);
    expect(result).toMatchObject({ emailed: 0, failed: 1 });
    expect(saved).toHaveLength(0);
  });

  it("stays quiet about tasks the person already finished", async () => {
    const { deps, sent } = setup([record()], { done: ["CA-VEH-REG", "CA-VEH-DL", "CA-HEALTH-COVEREDCA"] });
    await runReminders(deps);
    for (const mail of sent) expect(mail.text).not.toContain("Register your vehicle");
  });

  it("a dry run lists what would go out without sending, saving or exposing the address", async () => {
    const { deps, sent, saved } = setup([record()]);
    const result = await runReminders({ ...deps, dry: true });
    expect(sent).toHaveLength(0);
    expect(saved).toHaveLength(0);
    expect(result.preview?.[0]?.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("jordan@example.com");
  });
});
