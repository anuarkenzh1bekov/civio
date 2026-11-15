import { describe, expect, it } from "vitest";
import { upcomingReminders } from "./reminders";
import type { Task } from "./types";

const task = (id: string, date: string | undefined, title = id): Task =>
  ({
    id, ruleId: id, title, category: "vehicle", priority: "high", description: "", steps: [], documents: [],
    deadline: date ? { label: "x", date } : null, financial: null,
    source: { name: "Source", url: "https://example.gov/x", lastVerified: "2026-11-14" }, status: "pending", dependsOn: [],
  }) as Task;

describe("what the person sees", () => {
  it("previews upcoming reminders with their send dates", () => {
    const out = upcomingReminders([task("A", "2027-02-10", "Register")], [], "2027-02-05");
    expect(out[0]?.remindOn).toEqual(["2027-02-07", "2027-02-09"]);
  });
});
