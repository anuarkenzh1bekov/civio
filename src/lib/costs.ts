import type { Task } from "@/lib/types";

/**
 * Cost lines for the calculator. Civio stores no fee amounts: agency fees
 * depend on the vehicle, county and date, and the official pages could not be
 * opened from the build environment. Each line names what is charged and links
 * to the official source; the amount is whatever the user reads there and types in.
 */
export type CostField = {
  /** Rule the cost belongs to. The line shows only when that task is in the plan. */
  ruleId: string;
  id: string;
  label: string;
  hint: string;
};

export const COST_FIELDS: readonly CostField[] = [
  {
    ruleId: "CA-VEH-DL",
    id: "ca-dl-application",
    label: "Driver license application fee",
    hint: "One fee per applicant. The DMV lists the current amount.",
  },
  {
    ruleId: "CA-VEH-REG",
    id: "ca-reg-fees",
    label: "Registration fees and use tax",
    hint: "Depends on the vehicle's value, type and county. Use the DMV's fee calculator for new residents.",
  },
  {
    ruleId: "CA-VEH-REG",
    id: "ca-smog",
    label: "Smog certification",
    hint: "Set by the smog station, if your vehicle needs one.",
  },
  {
    ruleId: "CA-VEH-INSURANCE",
    id: "ca-auto-premium",
    label: "Auto insurance, change per month",
    hint: "The difference your insurer quotes for the California address. Can be negative.",
  },
  {
    ruleId: "TX-VEH-REG",
    id: "tx-reg-fees",
    label: "Registration and title fees",
    hint: "Paid at the county tax office. The amount depends on the county and vehicle.",
  },
  {
    ruleId: "TX-VEH-DL",
    id: "tx-dl-fee",
    label: "Driver license fee",
    hint: "Texas DPS lists the current amount.",
  },
];

export type CostLine = CostField & {
  taskTitle: string;
  sourceName: string;
  sourceUrl: string;
  amount: number | null;
};

export type CostSummary = {
  lines: CostLine[];
  /** Sum of the amounts entered so far. */
  total: number;
  entered: number;
  /** Things that change but that Civio does not put a number on. */
  changes: { ruleId: string; title: string; kind: "tax" | "coverage" | "penalty"; note: string }[];
};

export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) return null;
  return Math.round(value * 100) / 100;
}

export function summarizeCosts(tasks: readonly Task[], amounts: Readonly<Record<string, number>>): CostSummary {
  const byId = new Map(tasks.map((task) => [task.ruleId, task]));
  const lines: CostLine[] = [];
  for (const field of COST_FIELDS) {
    const task = byId.get(field.ruleId);
    if (!task) continue;
    const amount = amounts[field.id];
    lines.push({
      ...field,
      taskTitle: task.title,
      sourceName: task.source.name,
      sourceUrl: task.source.url,
      amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    });
  }
  const entered = lines.filter((line) => line.amount !== null);
  const total = Math.round(entered.reduce((sum, line) => sum + (line.amount ?? 0), 0) * 100) / 100;

  const changes: CostSummary["changes"] = [];
  for (const task of tasks) {
    if (!task.financial || task.financial.kind === "fee") continue;
    changes.push({ ruleId: task.ruleId, title: task.title, kind: task.financial.kind, note: task.financial.note });
  }
  return { lines, total, entered: entered.length, changes };
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (value: number) => USD.format(value);
