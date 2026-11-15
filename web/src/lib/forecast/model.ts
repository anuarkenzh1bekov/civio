import { compareBudget, matchingIncome, type MoveBudget } from "../budget";
import type { Profile } from "../types";
import stateData from "./data/states.json";
import metroData from "./data/metros.json";
import taxData from "./data/income-tax.json";
import type { Forecast } from "./schema";
export type { Forecast } from "./schema";

export type Filing = "single" | "joint";

type StateMarket = { rent: number[]; prices: number; goods: number; services: number };
type Metro = { name: string; states: string[]; rent: (number | null)[] };
type TaxRule = { brackets: number[][]; deduction: number; credit: number };
const states: Record<string, StateMarket> = stateData;
const metros: Record<string, Metro> = metroData;
const taxRules: Record<string, Record<Filing, TaxRule>> = taxData;
export const forecastSources = {
  prices: "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area/",
  rent: "https://data.census.gov/table/ACSDT5Y2024.B25031",
  spending: "https://www.bls.gov/cex/tables.htm",
  federal: "https://www.irs.gov/irb/2025-45_IRB",
  payroll: "https://www.ssa.gov/OACT/COLA/cbb.html",
  stateTax: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
  alabama: "https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf",
  movers: "https://www.movebuddha.com/blog/cost-move-out-state/",
  fromAK: "https://bestalaskahawaiimovers.com/moving-from-alaska",
  toAK: "https://bestalaskahawaiimovers.com/moving-to-alaska",
  fromHI: "https://bestalaskahawaiimovers.com/moving-from-hawaii",
  toHI: "https://hawaiianmovers.com/long-distance-shipping-to-hawaii/",
} as const;

export function areasIn(code: string) {
  return Object.entries(metros).filter(([, area]) => area.states.includes(code))
    .map(([id, area]) => ({ id, name: area.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function rentFor(code: string, bedrooms: number, metro?: string) {
  const area = metro ? metros[metro] : undefined;
  const local = area?.states.includes(code) ? area.rent[bedrooms] : null;
  return { rent: local ?? states[code]!.rent[bedrooms]!, area: local != null ? area?.name : undefined };
}

export function priceChange(origin: string, destination: string) {
  return (states[destination]!.prices / states[origin]!.prices - 1) * 100;
}

// BLS Consumer Expenditure Survey, 2024, table 1400. Annual US means for
// one, two, three, four, and five-or-more people (not per-person amounts).
const annualCosts = {
  food: [5644, 10158, 12205, 14543, 15605],
  transport: [6953, 14012, 15692, 19527, 19188],
  health: [4026, 7228, 6706, 7629, 6819],
  clothes: [1113, 1994, 2404, 2653, 3358],
  leisure: [2187, 3933, 4091, 4995, 4416],
  care: [619, 1023, 1188, 1347, 1144],
  education: [818, 1133, 2585, 2668, 2458],
};

export function livingCosts(code: string, people: number) {
  const i = people - 1;
  const { goods, services } = states[code]!;
  const monthly = (annual: number, index: number) => Math.round(annual * index / 1200);
  const foodAndClothes = monthly(annualCosts.food[i]! + annualCosts.clothes[i]!, goods);
  const transport = monthly(annualCosts.transport[i]!, services);
  const health = monthly(annualCosts.health[i]!, services);
  const education = monthly(annualCosts.education[i]!, services);
  const personal = monthly(annualCosts.leisure[i]! + annualCosts.care[i]!, services);
  return { transport, health, education, total: foodAndClothes + transport + health + education + personal };
}

function progressiveTax(income: number, bands: number[][]) {
  return bands.reduce((sum, [floor, rate], index) => {
    const ceiling = bands[index + 1]?.[0] ?? Infinity;
    return sum + Math.max(0, Math.min(income, ceiling) - floor!) * rate! / 100;
  }, 0);
}

const federal: Record<Filing, number[][]> = {
  single: [[0, 10], [12400, 12], [50400, 22], [105700, 24], [201775, 32], [256225, 35], [640600, 37]],
  joint: [[0, 10], [24800, 12], [100800, 22], [211400, 24], [403550, 32], [512450, 35], [768700, 37]],
};

// One W-2 earner, standard deduction, full-year residency. No local taxes,
// benefit deductions, dependent credits or state-specific phaseouts.
export function paycheck(gross: number, code: string, filing: Filing) {
  const rule = taxRules[code]![filing];
  const federalTax = progressiveTax(gross - (filing === "joint" ? 32200 : 16100), federal[filing]);
  let stateBase = gross - rule.deduction;
  // Alabama deducts federal income tax and steps down its standard deduction
  // every $500 of AGI starting at $26,000 (2026 withholding booklet).
  if (code === "AL") {
    const steps = Math.max(0, Math.floor((gross - 26000) / 500) + 1);
    const standard = filing === "single" ? Math.max(2500, 3000 - steps * 25) : Math.max(5000, 8500 - steps * 175);
    stateBase = gross - federalTax - standard - (filing === "single" ? 1500 : 3000);
  }
  const stateTax = Math.max(0, progressiveTax(stateBase, rule.brackets) - rule.credit);
  const payroll = Math.min(gross, 184500) * .062 + gross * .0145
    + Math.max(0, gross - (filing === "joint" ? 250000 : 200000)) * .009;
  return { net: Math.max(0, gross - federalTax - stateTax - payroll), stateTax };
}

type Range = readonly [number, number];
type MoverGuide = { range: Range; source: string };
export function movingGuide(origin: string, destination: string, bedrooms: number): MoverGuide | null {
  const size = Math.max(1, bedrooms) - 1;
  if ([origin, destination].includes("AK") && [origin, destination].includes("HI")) return null;
  const fromAK: Range[] = [[4800, 7800], [7200, 11200], [10200, 15000], [14000, 19500]];
  const toAK: Range[] = [[4500, 7200], [6800, 10500], [9500, 14200], [13500, 18500]];
  const fromHI: Range[] = [[5400, 8600], [8800, 13800], [13200, 18200], [17800, 23500]];
  if (origin === "AK") return { range: fromAK[size]!, source: forecastSources.fromAK };
  if (destination === "AK") return { range: toAK[size]!, source: forecastSources.toAK };
  if (origin === "HI") return { range: fromHI[size]!, source: forecastSources.fromHI };
  // Inbound Hawaii source covers full households. Small shipments need a quote.
  if (destination === "HI") return bedrooms >= 2 ? { range: [10000, 20000], source: forecastSources.toHI } : null;
  // Published 250–2,500-mile full-service ranges, spanning the distance bands.
  const domestic: Range[] = [[700, 3500], [1600, 6500], [1600, 6500], [2100, 13700]];
  return { range: domestic[size]!, source: forecastSources.movers };
}

export function estimateBudget(f: Forecast): MoveBudget {
  const net = (pay: number, code: string) => f.payMode === "net" ? pay : Math.round(paycheck(pay, code, f.filing).net / 12);
  const range = movingGuide(f.origin, f.destination, f.bedrooms)?.range;
  const moving = f.moving !== "estimate" ? f.moving : range ? (range[0] + range[1]) / 2 : undefined;
  return {
    incomeNow: net(f.pay, f.origin), incomeAfter: net(f.offer ?? f.pay, f.destination),
    housingNow: rentFor(f.origin, f.bedrooms, f.originMetro).rent,
    housingAfter: rentFor(f.destination, f.bedrooms, f.destinationMetro).rent,
    otherNow: livingCosts(f.origin, f.people).total, otherAfter: livingCosts(f.destination, f.people).total,
    moving,
  };
}

// Retain a user's line edits when reopening an estimate. A new assumption
// recalculates just the lines whose modeled values changed.
export function budgetForAnswers(f: Forecast, profile: Profile, keepEdits: boolean) {
  const budget = estimateBudget(f);
  if (!keepEdits || f.origin !== profile.currentState || f.destination !== profile.destinationState || !profile.budget) return budget;
  const old = profile.forecast ? estimateBudget(profile.forecast) : null;
  for (const key of Object.keys(budget) as (keyof MoveBudget)[]) {
    const saved = profile.budget[key];
    if (old ? old[key] === budget[key] && old[key] !== saved : saved !== undefined) budget[key] = saved;
  }
  return budget;
}

// Lowest whole-dollar gross wage yielding the required annual take-home.
function grossForNet(net: number, f: Forecast) {
  let low = 0;
  let high = Math.max(1, Math.ceil(net));
  while (paycheck(high, f.destination, f.filing).net < net) high *= 2;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (paycheck(mid, f.destination, f.filing).net >= net) high = mid;
    else low = mid + 1;
  }
  return low;
}

export function forecastOutcome(f: Forecast, budget: MoveBudget) {
  const { monthly, moving } = compareBudget(budget);
  const guide = movingGuide(f.origin, f.destination, f.bedrooms);
  const modeled = estimateBudget(f);
  const useGuide = f.moving === "estimate" && moving !== null && budget.moving === modeled.moving && guide;
  const costs: Range | null = moving === null ? null : useGuide ? [guide.range[0] * 100, guide.range[1] * 100] : [moving, moving];
  const year: Range | null = monthly !== null && costs ? [12 * monthly - costs[1], 12 * monthly - costs[0]] : null;
  const months: Range | null = costs && monthly !== null && monthly > 0 ? [Math.ceil(costs[0] / monthly), Math.ceil(costs[1] / monthly)] : null;
  const target = matchingIncome(budget);
  const canConvert = f.payMode === "gross" && target !== null && budget.incomeAfter === modeled.incomeAfter;
  const grossTarget = canConvert ? grossForNet(target * 12 / 100, f) : null;
  const firstYearGross = canConvert && costs ? grossForNet((target * 12 + (costs[0] + costs[1]) / 2) / 100, f) : null;
  return { monthly, costs, year, months, grossTarget, firstYearGross, target };
}

export function folderCost(f: Forecast, category: "taxes" | "health" | "vehicle" | "family") {
  if (category === "taxes") {
    if (f.payMode === "net") return null;
    return { label: "Estimated state wage tax", before: Math.round(paycheck(f.pay, f.origin, f.filing).stateTax / 12), after: Math.round(paycheck(f.offer ?? f.pay, f.destination, f.filing).stateTax / 12) };
  }
  const key = { health: "health", vehicle: "transport", family: "education" } as const;
  const label = { health: "Household healthcare", vehicle: "Household transportation", family: "Household education" };
  return { label: label[category], before: livingCosts(f.origin, f.people)[key[category]], after: livingCosts(f.destination, f.people)[key[category]] };
}
