const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function parse(iso: string): Date | null {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = parse(iso);
  return date ? DATE.format(date) : iso;
}

export function formatShortDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = parse(iso);
  return date ? SHORT.format(date) : iso;
}

/** Whole days from today (local) to the given date. Negative when it has passed. */
export function daysUntil(iso: string): number | null {
  const date = parse(iso);
  if (!date) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today) / 86_400_000);
}
