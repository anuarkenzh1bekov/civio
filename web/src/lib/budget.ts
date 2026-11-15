export type MoveBudget = Partial<Record<
  "incomeNow" | "incomeAfter" | "housingNow" | "housingAfter" | "otherNow" | "otherAfter" | "moving",
  number
>>;

export const monthlyRows = [
  { label: "Take-home income", now: "incomeNow", after: "incomeAfter" },
  { label: "Housing & utilities", now: "housingNow", after: "housingAfter" },
  { label: "Other living costs", now: "otherNow", after: "otherAfter" },
] as const;

// Amounts are USD. Calculate in cents so small differences survive annualization.
function cents(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function balance(income?: number, housing?: number, other?: number) {
  const pay = cents(income);
  const home = cents(housing);
  const expenses = cents(other);
  return pay === null || home === null || expenses === null ? null : pay - home - expenses;
}

export function compareBudget(budget: MoveBudget = {}) {
  const now = balance(budget.incomeNow, budget.housingNow, budget.otherNow);
  const after = balance(budget.incomeAfter, budget.housingAfter, budget.otherAfter);
  const monthly = now === null || after === null ? null : after - now;
  const moving = cents(budget.moving);
  const year = monthly === null || moving === null ? null : monthly * 12 - moving;
  return { now, after, monthly, moving, year };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const dollars = (cents: number) => usd.format(cents / 100);
export function difference(cents: number) {
  if (cents === 0) return "No change";
  return `${dollars(Math.abs(cents))} ${cents < 0 ? "less" : "more"}`;
}

export function matchingIncome(budget: MoveBudget = {}) {
  const now = balance(budget.incomeNow, budget.housingNow, budget.otherNow);
  const housing = cents(budget.housingAfter);
  const other = cents(budget.otherAfter);
  return now === null || housing === null || other === null ? null : Math.max(0, now + housing + other);
}
