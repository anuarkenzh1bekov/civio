import { z } from "zod";
import { stateName, US_STATES } from "../states";
import type { Profile } from "../types";
import { areasIn, movingGuide, type Forecast } from "./model";

import { forecastState, peopleCount, bedroomCount, planAmount } from "./schema";
export const answersSchema = z.object({
  origin: forecastState, destination: forecastState, people: peopleCount, bedrooms: bedroomCount,
  areas: z.string(), payMode: z.enum(["gross", "net"]), pay: planAmount, filing: z.enum(["single", "joint"]), offer: planAmount.nullable(),
  moving: z.union([planAmount, z.literal("estimate")]), work: z.enum(["w2", "1099", "both", "none", "skip"]),
  health: z.enum(["employer", "marketplace", "medicaid", "other", "none", "skip"]),
  children: z.string(), car: z.enum(["registered", "vehicle", "drive", "none", "skip"]), date: z.string(),
}).partial();
export type Answers = z.infer<typeof answersSchema>;
export type Step = keyof Answers;
export const extraSteps: Step[] = ["date", "work", "health", "children", "car"];

export function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function parseMoney(text: string) {
  const match = /^\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(k|m)?$/i.exec(text.trim());
  if (!match) return null;
  const suffix = match[2]?.toLowerCase();
  const value = Number(match[1]!.replaceAll(",", "")) * (suffix === "m" ? 1_000_000 : suffix === "k" ? 1000 : 1);
  return planAmount.safeParse(value).success ? Math.round(value * 100) / 100 : null;
}

function resolveState(value: string) {
  const input = value.trim().toLowerCase().replaceAll(".", "");
  if (["washington dc", "washington, dc"].includes(input)) return "DC";
  return US_STATES.find(s => s.code.toLowerCase() === input || s.name.toLowerCase() === input)?.code;
}

export function splitAreas(value = "") {
  const [originMetro = "", destinationMetro = ""] = value.split("|");
  return { originMetro: originMetro || undefined, destinationMetro: destinationMetro || undefined };
}

export function questionOrder(a: Answers, extras: boolean): Step[] {
  const steps: Step[] = ["origin", "destination", "people", "bedrooms", "areas", "payMode", "pay"];
  if (a.payMode === "gross") steps.push("filing");
  return [...steps, "offer", "moving", ...(extras ? extraSteps.filter(s => !(s === "work" && a.payMode === "gross")) : [])];
}

export function completedForecast(a: Answers): Forecast | null {
  if (!a.origin || !a.destination || a.origin === a.destination || !a.people || a.bedrooms === undefined
    || a.areas === undefined || !a.payMode || a.pay === undefined || a.offer === undefined || a.moving === undefined
    || (a.payMode === "gross" && !a.filing)) return null;
  return { origin: a.origin, destination: a.destination, people: a.people, bedrooms: a.bedrooms,
    ...splitAreas(a.areas), payMode: a.payMode, pay: a.pay, filing: a.filing ?? "single", offer: a.offer, moving: a.moving };
}

export function initialAnswers(profile: Profile): Answers {
  const f = profile.forecast;
  const base: Answers = f ? {
    origin: f.origin, destination: f.destination, pay: f.pay, payMode: f.payMode, offer: f.offer,
    people: f.people, bedrooms: f.bedrooms, filing: f.filing, moving: f.moving,
    areas: [f.originMetro, f.destinationMetro].join("|"),
  } : { origin: profile.currentState, destination: profile.destinationState };
  return { ...base, date: profile.moveDate, work: profile.income,
    health: profile.insurance,
    children: profile.hasChildren === false ? "none" : profile.hasChildren ? profile.childAges?.join(", ") || "yes" : undefined,
    car: profile.hasVehicle && profile.drives === true ? profile.vehicleRegisteredInCurrentState ? "registered" : "vehicle"
      : profile.hasVehicle === false && profile.drives !== undefined ? profile.drives ? "drive" : "none" : undefined };
}

export function checklistAnswers(a: Answers): Partial<Profile> {
  const p: Partial<Profile> = {};
  if (a.date !== undefined) p.moveDate = a.date === "skip" ? undefined : a.date;
  if (a.payMode === "gross") {
    p.income = "w2"; p.employment = "employee";
    if (a.filing === "joint") p.marital = "married";
  } else if (a.work !== undefined) {
    p.income = a.work === "skip" ? undefined : a.work;
    p.employment = a.work === "none" ? "unemployed" : a.work === "1099" ? "self_employed" : a.work === "skip" ? undefined : "employee";
  }
  if (a.health !== undefined) p.insurance = a.health === "skip" ? undefined : a.health;
  if (a.children !== undefined) {
    p.hasChildren = a.children === "skip" ? undefined : a.children !== "none";
    p.childAges = /^\d/.test(a.children) ? a.children.split(",").map(Number) : undefined;
  }
  if (a.car !== undefined) {
    p.hasVehicle = a.car === "skip" ? undefined : ["registered", "vehicle"].includes(a.car);
    p.drives = a.car === "skip" ? undefined : a.car !== "none";
    p.vehicleRegisteredInCurrentState = a.car === "registered" ? true : undefined;
  }
  return p;
}

type Choice = { value: string; label: string };
function choices(pairs: [string, string][]): Choice[] { return pairs.map(([value, label]) => ({ value, label })); }
export function options(step: Step, a: Answers): Choice[] {
  switch (step) {
    case "origin": case "destination": return (step === "origin" ? ["TX", "CA", "AK"] : ["CA", "FL", "AL"])
      .filter(s => step !== "destination" || s !== a.origin).map(s => ({ value: s, label: stateName(s) }));
    case "people": return choices([["1","Just me"],["2","2 people"],["3","3 people"],["4","4 people"],["5","5 or more"]]);
    case "bedrooms": return choices([["0","Studio"],["1","1 bedroom"],["2","2 bedrooms"],["3","3 bedrooms"],["4","4 bedrooms"]]);
    case "payMode": return choices([["gross","One W-2 salary"],["net","Monthly take-home pay"]]);
    case "filing": return choices([["single","Single"],["joint","Married, filing jointly"]]);
    case "offer": return choices([["same","Keep my current pay"]]);
    case "moving": return choices([["estimate", movingGuide(a.origin!, a.destination!, a.bedrooms!) ? "Use the estimate" : "I’ll add a quote later"],["0","My move is covered"]]);
    case "work": return choices([["w2","Employee"],["1099","Self-employed"],["both","Both"],["none","No earned income"],["skip","Skip"]]);
    case "health": return choices([["employer","Employer plan"],["marketplace","Marketplace"],["medicaid","Medicaid"],["other","Other coverage"],["none","Uninsured"],["skip","Skip"]]);
    case "car": return choices([["registered","Bringing my registered car"],["vehicle","Bringing another vehicle"],["drive","Driving without my own car"],["none","No car or driving"],["skip","Skip"]]);
    case "children": return choices([["none","No children"],["yes","Yes, skip ages"],["skip","Skip"]]);
    case "date": return choices([["skip","Date undecided"]]);
    default: return [];
  }
}

export function question(step: Step, a: Answers): string {
  switch (step) {
    case "origin": return "Which state do you live in now?";
    case "destination": return "Where are you thinking of moving?";
    case "people": return "How many people share your moving budget?";
    case "bedrooms": return "What size home should I compare?";
    case "areas": return "Do you have particular areas in mind?";
    case "payMode": return "How should I compare your income?";
    case "pay": return a.payMode === "gross" ? "What do you earn each year before taxes?" : "What does your household take home each month?";
    case "filing": return "How do you file your federal taxes?";
    case "offer": return a.payMode === "gross" ? "Do you have a salary offer for the move?" : "Will your monthly take-home pay change?";
    case "moving": return "Do you have a moving quote yet?";
    case "date": return "When are you planning to move?";
    case "work": return "What kind of work income do you have?";
    case "health": return "How do you get health coverage today?";
    case "children": return "Are children moving with you?";
    case "car": return "Will you bring a vehicle or drive after the move?";
  }
}

export function answerLabel(step: Step, a: Answers): string {
  const value = a[step];
  if (step === "origin" || step === "destination") return stateName(String(value));
  if (step === "areas") {
    const { originMetro, destinationMetro } = splitAreas(a.areas);
    if (!originMetro && !destinationMetro) return "Use both state medians";
    return [[a.origin, originMetro], [a.destination, destinationMetro]].map(([s, m]) => areasIn(s!).find(area => area.id === m)?.name ?? stateName(s)).join(" → ");
  }
  if (["pay", "offer", "moving"].includes(step) && typeof value === "number") return money(value) + (step === "moving" ? "" : a.payMode === "gross" ? " / year" : " / month");
  const option = options(step, a).find(o => o.value === (value === null ? "same" : String(value)));
  return option?.label ?? String(value);
}

type Reply = { answers: Answers; error?: never } | { error: string; answers?: never };
export function acceptReply(step: Step, input: string, a: Answers): Reply {
  let value = input.trim();
  const option = options(step, a).find(o => o.value.toLowerCase() === value.toLowerCase() || o.label.toLowerCase() === value.toLowerCase());
  if (option) value = option.value;
  const next = { ...a };
  if (step === "origin" || step === "destination") {
    const pair = step === "origin" ? value.replace(/^from\s+/i, "").split(/\s+to\s+|\s*(?:→|->)\s*/i) : [value];
    const code = resolveState(pair[0]!);
    const dest = pair.length === 2 ? resolveState(pair[1]!) : undefined;
    if (!code || pair.length > 2 || (pair.length === 2 && !dest)) return { error: "Enter a US state name or its two-letter code." };
    if ((step === "destination" && code === a.origin) || (dest && code === dest)) return { error: "Choose two different states for an interstate move." };
    next[step] = code;
    if (dest) next.destination = dest;
    if (step === "origin" && !dest && next.destination === code) delete next.destination;
    const old = splitAreas(a.areas);
    if (a.areas !== undefined) next.areas = [a.origin === next.origin ? old.originMetro : "", a.destination === next.destination ? old.destinationMetro : ""].join("|");
  } else if (step === "areas") {
    const { originMetro, destinationMetro } = splitAreas(value);
    if (value.split("|").length !== 2 || (originMetro && !areasIn(a.origin!).some(x => x.id === originMetro)) || (destinationMetro && !areasIn(a.destination!).some(x => x.id === destinationMetro))) return { error: "Choose areas within your two states." };
    next.areas = value;
  } else if (step === "pay" || step === "offer" || step === "moving") {
    if (step === "offer" && value === "same") next.offer = null;
    else if (step === "moving" && value === "estimate") next.moving = "estimate";
    else {
      const n = parseMoney(value);
      if (n === null) return { error: "Enter one amount in US dollars, such as $85,000 or 85k." };
      next[step] = n;
    }
  } else if (step === "date") {
    if (value !== "skip" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return { error: "Choose a valid move date." };
    next.date = value;
  } else if (step === "children") {
    if (!option && (!/^\d{1,2}(?:\s*,\s*\d{1,2}){0,11}$/.test(value) || value.split(",").some(n => Number(n) > 25))) return { error: "Enter ages from 0 to 25 separated by commas, or choose an answer below." };
    next.children = value;
  } else {
    if (!option) return { error: "Choose one of the answers below." };
    if (step === "people" || step === "bedrooms") next[step] = Number(value);
    else Object.assign(next, { [step]: value });
    if (step === "payMode" && a.payMode && a.payMode !== next.payMode) {
      delete next.pay; delete next.offer; delete next.filing;
    }
  }
  return { answers: next };
}
