import { describe, expect, it } from "vitest";
import { DEMO_PROFILE } from "@/lib/demo";
import { RULES } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";
import { buildConfirmation, buildDigest, daysBetween, dueReminders, maskEmail, upcomingReminders, whenText } from "./reminders";
import type { Task } from "./types";

const task = (id: string, date: string | undefined, title = id): Task =>
  ({
    id, ruleId: id, title, category: "vehicle", priority: "high", description: "", steps: [], documents: [],
    deadline: date ? { label: "x", date } : null, financial: null,
    source: { name: "Source", url: "https://example.gov/x", lastVerified: "2026-11-14" }, status: "pending", dependsOn: [],
  }) as Task;

describe("which reminders are due", () => {
  it("fires at 7, 3 and 1 days and not between", () => {
    const t = [task("A", "2027-02-10")];
    expect(dueReminders(t, [], [], "2027-02-02").items).toHaveLength(0); // 8 days
    expect(dueReminders(t, [], [], "2027-02-03").items[0]?.daysLeft).toBe(7);
    expect(dueReminders(t, [], [], "2027-02-07").items[0]?.daysLeft).toBe(3);
    expect(dueReminders(t, [], [], "2027-02-09").items[0]?.daysLeft).toBe(1);
    expect(dueReminders(t, [], [], "2027-02-10").items[0]?.daysLeft).toBe(0);
  });

  it("never sends the same reminder twice", () => {
    const t = [task("A", "2027-02-10")];
    const first = dueReminders(t, [], [], "2027-02-03");
    expect(first.items).toHaveLength(1);
    expect(dueReminders(t, [], first.mark, "2027-02-04").items).toHaveLength(0);
    expect(dueReminders(t, [], first.mark, "2027-02-07").items).toHaveLength(1);
  });

  it("sends one email, not three, to someone who joins two days before the deadline", () => {
    const t = [task("A", "2027-02-10")];
    const first = dueReminders(t, [], [], "2027-02-08");
    expect(first.items).toHaveLength(1);
    // The 7- and 3-day markers are consumed with it, so the next days stay quiet until the 1-day point.
    expect(dueReminders(t, [], first.mark, "2027-02-09").items).toHaveLength(1);
    expect(dueReminders(t, [], [...first.mark, ...dueReminders(t, [], first.mark, "2027-02-09").mark], "2027-02-10").items).toHaveLength(0);
  });

  it("skips finished tasks and tasks without a date", () => {
    const t = [task("A", "2027-02-10"), task("B", undefined)];
    expect(dueReminders(t, ["A"], [], "2027-02-09").items).toHaveLength(0);
  });

  it("reports an overdue task once, and not when it is long overdue", () => {
    const t = [task("A", "2027-02-10")];
    const first = dueReminders(t, [], [], "2027-02-15");
    expect(first.items[0]?.daysLeft).toBe(-5);
    expect(dueReminders(t, [], first.mark, "2027-02-16").items).toHaveLength(0);
    expect(dueReminders(t, [], [], "2027-04-10").items).toHaveLength(0);
  });

  it("orders the most urgent first", () => {
    const t = [task("LATE", "2027-02-10"), task("SOON", "2027-02-04")];
    expect(dueReminders(t, [], [], "2027-02-03").items.map((i) => i.taskId)).toEqual(["SOON", "LATE"]);
  });

  it("works on the real plan: only tasks with a countable deadline are reminded", () => {
    const plan = generatePlan(DEMO_PROFILE, RULES); // move date 2027-01-15
    const today = "2027-02-01"; // 3 days before the 20-day vehicle registration deadline
    const { items } = dueReminders(plan, [], [], today);
    expect(items.map((i) => i.taskId)).toContain("CA-VEH-REG");
    expect(items.every((i) => i.dueDate >= "2027-01-01")).toBe(true);
  });
});

describe("what the person sees", () => {
  it("previews upcoming reminders with their send dates", () => {
    const out = upcomingReminders([task("A", "2027-02-10", "Register")], [], "2027-02-05");
    expect(out[0]?.remindOn).toEqual(["2027-02-07", "2027-02-09"]);
  });

  it("words the time left", () => {
    expect(whenText(0)).toBe("today");
    expect(whenText(1)).toBe("tomorrow");
    expect(whenText(5)).toBe("in 5 days");
    expect(whenText(-1)).toBe("1 day overdue");
    expect(whenText(-4)).toBe("4 days overdue");
    expect(daysBetween("2027-02-01", "2027-02-10")).toBe(9);
  });

  it("builds an email with the source, the plan link and an unsubscribe link", () => {
    const items = dueReminders([task("A", "2027-02-10", "Register <your> car")], [], [], "2027-02-09").items;
    const mail = buildDigest(items, { plan: "https://civio.test/dashboard?s=abc", unsubscribe: "https://civio.test/u?token=t" });
    expect(mail.subject).toBe('Civio: "Register <your> car" is due tomorrow');
    expect(mail.text).toContain("https://example.gov/x");
    expect(mail.text).toContain("https://civio.test/u?token=t");
    expect(mail.html).toContain("Register &lt;your&gt; car");
    expect(mail.html).not.toContain("<your>");
  });

  it("summarises several deadlines in the subject", () => {
    const items = dueReminders([task("A", "2027-02-10"), task("B", "2027-02-10")], [], [], "2027-02-09").items;
    expect(buildDigest(items, { plan: "p", unsubscribe: "u" }).subject).toBe("Civio: 2 deadlines need your attention");
  });

  it("asks for confirmation before anything else is sent", () => {
    const mail = buildConfirmation({ confirm: "https://civio.test/c?token=t", unsubscribe: "https://civio.test/u?token=t" });
    expect(mail.text).toContain("https://civio.test/c?token=t");
    expect(mail.text).toContain("ignore this message");
  });

  it("masks the address", () => {
    expect(maskEmail("jordan@example.com")).toBe("j***@example.com");
  });
});
