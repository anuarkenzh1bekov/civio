import { describe, expect, it } from "vitest";
import { compareBudget, matchingIncome } from "./budget";
import { DEMO_PROFILE } from "./demo";

describe("move budget in cents", () => {
  it("compares staying with moving and subtracts the move once", () => {
    expect(compareBudget(DEMO_PROFILE.budget)).toEqual({ now: 200000, after: 150000, monthly: -50000, moving: 320000, year: -920000 });
    expect(matchingIncome({ ...DEMO_PROFILE.budget, incomeAfter: undefined })).toBe(640000);
  });
  it("keeps unknown amounts separate from explicit zeroes", () => {
    expect(compareBudget({ ...DEMO_PROFILE.budget, moving: undefined })).toMatchObject({ monthly: -50000, year: null });
    expect(compareBudget({ ...DEMO_PROFILE.budget, incomeNow: undefined, moving: 0 })).toMatchObject({ monthly: null, moving: 0, year: null });
    expect(compareBudget()).toMatchObject({ now: null, after: null, year: null });
  });
  it("keeps deficit budgets, gains and a zero difference distinct", () => {
    const budget = { incomeNow: 0, incomeAfter: 0.20, housingNow: 1, housingAfter: 1.10, otherNow: 0, otherAfter: 0, moving: 0 };
    expect(compareBudget(budget)).toMatchObject({ now: -100, after: -90, monthly: 10, year: 120 });
    expect(compareBudget({ ...budget, moving: 1.20 }).year).toBe(0);
  });
});
