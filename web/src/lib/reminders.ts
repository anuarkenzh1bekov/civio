import type { Task } from "@/lib/types";

/** Days before a deadline when a reminder goes out. */
export const LEAD_DAYS = [7, 3, 1] as const;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
