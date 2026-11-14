import { describe, expect, it } from "vitest";
import { compareBudget } from "../budget";
import { US_STATES } from "../states";
import { acceptReply, answerLabel, checklistAnswers, completedForecast, initialAnswers, parseMoney, questionOrder, type Answers, type Step } from "./conversation";
import { areasIn, budgetForAnswers, estimateBudget, folderCost, forecastOutcome, livingCosts, movingGuide, paycheck, priceChange, rentFor, type Forecast } from "./model";

const base: Forecast = { origin: "AK", destination: "AL", people: 2, bedrooms: 2, payMode: "gross", pay: 85000, offer: null, filing: "single", moving: "estimate" };

describe("guided move comparison", () => {
  it("covers all supported markets and falls back to the right state's rent", () => {
    for (const { code } of US_STATES) {
      expect(Number.isFinite(priceChange("CA", code))).toBe(true);
      for (let i = 0; i <= 4; i++) expect(rentFor(code, i).rent).toBeGreaterThan(0);
      for (let n = 1; n <= 5; n++) expect(livingCosts(code, n).total).toBeGreaterThan(0);
      expect(paycheck(85000, code, "joint").net).toBeGreaterThan(0);
    }
    expect(areasIn("AK").map(x => x.name)).toContain("Anchorage");
    expect(rentFor("AK", 2, "11260").rent).toBe(1443);
    expect(rentFor("AL", 2, "13820").rent).toBe(1120);
    expect(rentFor("AL", 2, "11260")).toEqual(rentFor("AL", 2));
  });
  it("taxes wage bands progressively and caps Social Security per earner", () => {
    expect(paycheck(85000, "TX", "single").net).toBeCloseTo(68627.5);
    expect(paycheck(85000, "TX", "joint").net).toBeCloseTo(72657.5);
    expect(paycheck(0, "AL", "single").net).toBe(0);
    // Federal income tax is $14,270. Alabama then taxes $86,730 across its three bands.
    expect(paycheck(105000, "AL", "single").stateTax).toBeCloseTo(500 * .02 + 2500 * .04 + 83730 * .05);
    expect(paycheck(400000, "WA", "single").stateTax).toBe(0);
    expect(paycheck(210000, "TX", "single").net - paycheck(200000, "TX", "single").net).toBeCloseTo(7365);
  });
  it("produces first-year ranges, payback and the lowest whole-dollar salary to match disposable income", () => {
    const f = { ...base, offer: 105000, originMetro: "11260", destinationMetro: "13820" };
    const b = estimateBudget(f);
    const o = forecastOutcome(f, b);
    const { monthly, year } = compareBudget(b);
    expect(o.costs).toEqual([720000, 1120000]);
    expect(o.year).toEqual([monthly! * 12 - 1120000, monthly! * 12 - 720000]);
    expect(year).toBe((o.year![0] + o.year![1]) / 2);
    expect(o.months).toEqual([Math.ceil(720000 / monthly!), Math.ceil(1120000 / monthly!)]);
    const need = o.target! * 12 / 100;
    expect(paycheck(o.grossTarget!, "AL", "single").net).toBeGreaterThanOrEqual(need);
    expect(paycheck(o.grossTarget! - 1, "AL", "single").net).toBeLessThan(need);
    expect(o.firstYearGross!).toBeGreaterThan(o.grossTarget!);
  });
  it("handles zero income, payroll-independent households and routes without shipping benchmarks", () => {
    const f: Forecast = { ...base, destination: "HI", payMode: "net", moving: "estimate", offer: 0 };
    const b = estimateBudget(f);
    expect(b).toMatchObject({ incomeNow: 85000, incomeAfter: 0, moving: undefined });
    expect(forecastOutcome(f, b)).toMatchObject({ year: null, months: null, grossTarget: null });
    expect(folderCost(f, "taxes")).toBeNull();
    expect(movingGuide("CA", "HI", 1)).toBeNull();
    expect(forecastOutcome(f, { ...b, moving: 0 }).costs).toEqual([0, 0]);
  });
  it("retains manual and old budgets and recomputes changed assumptions", () => {
    const budget = { ...estimateBudget(base), incomeAfter: 6000, housingNow: 999 };
    const profile = { currentState: "AK", destinationState: "AL", budget, forecast: base };
    expect(budgetForAnswers(base, profile, true)).toEqual(budget);
    expect(budgetForAnswers({ ...base, offer: 104000 }, profile, true).housingNow).toBe(999);
    expect(budgetForAnswers({ ...base, offer: 104000 }, profile, true).incomeAfter).not.toBe(6000);
    expect(forecastOutcome(base, budget).grossTarget).toBeNull();
    expect(budgetForAnswers(base, { ...profile, forecast: undefined }, true)).toEqual(budget);
    expect(budgetForAnswers(base, profile, false)).toEqual(estimateBudget(base));
    expect(budgetForAnswers({ ...base, origin: "CA" }, profile, true).housingNow).not.toBe(999);
  });
  it("collects a route, asks only relevant questions and supports a saved forecast round trip", () => {
    let answers: Answers = {};
    const reply = (step: Step, value: string) => {
      const result = acceptReply(step, value, answers);
      expect(result.error).toBeUndefined();
      answers = result.answers!;
    };
    reply("origin", "from Alaska to Alabama"); reply("people", "2"); reply("bedrooms", "2"); reply("areas", "11260|13820");
    reply("payMode", "One W-2 salary"); reply("pay", "$85k"); reply("filing", "single"); reply("offer", "same"); reply("moving", "estimate");
    expect(completedForecast(answers)).toMatchObject({ ...base, originMetro: "11260", destinationMetro: "13820" });
    expect(completedForecast(initialAnswers({ forecast: completedForecast(answers)! }))).toEqual(completedForecast(answers));
    expect(acceptReply("destination", "AK", answers).error).toBeTruthy();
    expect(acceptReply("areas", "13820|11260", answers).error).toBeTruthy();
    expect(acceptReply("origin", "CA", answers).answers?.areas).toBe("|13820");
    expect(answerLabel("offer", answers)).toBe("Keep my current pay");
    reply("payMode", "net");
    expect(answers.pay).toBeUndefined();
    expect(answers.offer).toBeUndefined();
    expect(questionOrder(answers, false)).not.toContain("filing");
    expect(parseMoney("85,00")).toBeNull();
    expect(parseMoney("0")).toBe(0);
    expect(acceptReply("date", "2026-02-30", answers).error).toBeTruthy();
    reply("work", "1099"); reply("health", "employer"); reply("children", "4, 10"); reply("car", "none");
    expect(checklistAnswers(answers)).toMatchObject({ employment: "self_employed", hasChildren: true, childAges: [4, 10], hasVehicle: false, drives: false, insurance: "employer" });
  });
});
