import { describe, expect, it } from "vitest";
import { addDays, answerFromRules, applyPatch, describePatch, diffPatch, nextQuestion, progress } from "./flow";

const TODAY = "2026-11-14";

describe("guided intake flow", () => {
  it("asks for the states first, then the date, in a fixed order", () => {
    expect(nextQuestion({}, [], TODAY)?.field).toBe("currentState");
    expect(nextQuestion({ currentState: "TX" }, [], TODAY)?.field).toBe("destinationState");
    expect(nextQuestion({ currentState: "TX", destinationState: "CA" }, [], TODAY)?.field).toBe("moveDate");
  });

  it("does not offer the origin state as a destination", () => {
    const question = nextQuestion({ currentState: "TX" }, [], TODAY);
    expect(question?.chips.map((chip) => chip.patch?.destinationState)).not.toContain("TX");
  });

  it("never asks again about a declined question and finishes with null", () => {
    const base = { currentState: "TX", destinationState: "CA" } as const;
    const skipped = ["moveDate", "employment", "insurance", "hasVehicle", "drives", "hasChildren"] as const;
    expect(nextQuestion({ ...base }, skipped, TODAY)).toBeNull();
  });

  it("derives what follows from an answer instead of asking again", () => {
    const withCar = applyPatch({}, { hasVehicle: true });
    expect(withCar.drives).toBe(true);
    expect(applyPatch({}, { employment: "self_employed" }).income).toBe("1099");
    expect(applyPatch({ hasChildren: true, childAges: [4] }, { hasChildren: false }).childAges).toEqual([]);
    expect(applyPatch({}, { childAges: [4, 9] }).hasChildren).toBe(true);
  });

  it("skips the drives question when a vehicle is coming, and asks it when there is none", () => {
    const profile = { currentState: "TX", destinationState: "CA", moveDate: "2027-01-01", employment: "employee", insurance: "employer" } as const;
    expect(nextQuestion({ ...profile, hasVehicle: true, drives: true }, [], TODAY)?.field).toBe("hasChildren");
    expect(nextQuestion({ ...profile, hasVehicle: false }, [], TODAY)?.field).toBe("drives");
  });

  it("asks for ages only when there are children", () => {
    const profile = {
      currentState: "TX", destinationState: "CA", moveDate: "2027-01-01", employment: "employee", insurance: "employer",
      hasVehicle: false, drives: false,
    } as const;
    expect(nextQuestion({ ...profile, hasChildren: true }, [], TODAY)?.field).toBe("childAges");
    expect(nextQuestion({ ...profile, hasChildren: false }, [], TODAY)).toBeNull();
  });

  it("keeps the earlier state when the answer would make both states the same", () => {
    const merged = applyPatch({ currentState: "TX", destinationState: "CA" }, { destinationState: "TX" });
    expect(merged.destinationState).toBe("CA");
    expect(applyPatch({ currentState: "TX", destinationState: "CA" }, { currentState: "CA" }).currentState).toBe("TX");
  });

  it("computes date chips from today", () => {
    expect(addDays(TODAY, 14)).toBe("2026-11-28");
    const chips = nextQuestion({ currentState: "TX", destinationState: "CA" }, [], TODAY)?.chips ?? [];
    expect(chips[0]?.patch?.moveDate).toBe("2026-11-28");
  });

  it("reports only what changed", () => {
    const before = { currentState: "TX" } as const;
    const after = applyPatch(before, { destinationState: "FL", hasVehicle: true });
    expect(Object.keys(diffPatch(before, after)).sort()).toEqual(["destinationState", "drives", "hasVehicle"]);
    expect(describePatch({ destinationState: "FL" })[0]?.text).toBe("Moving to Florida");
  });

  it("counts progress, with declined questions counted as settled", () => {
    expect(progress({}, []).done).toBe(0);
    const p = progress({ currentState: "TX", destinationState: "CA" }, []);
    expect(p.done).toBe(2);
    expect(progress({ currentState: "TX", destinationState: "CA" }, ["moveDate"]).done).toBe(3);
  });
});

describe("answers read without a model", () => {
  it("reads yes and no for the question that was asked", () => {
    expect(answerFromRules("hasVehicle", "yes, one car").patch).toEqual({ hasVehicle: true });
    expect(answerFromRules("hasVehicle", "No, I don't have one").patch).toEqual({ hasVehicle: false });
    expect(answerFromRules("hasChildren", "nope").patch).toEqual({ hasChildren: false, childAges: [] });
  });

  it("reads employment, insurance and children's ages", () => {
    expect(answerFromRules("employment", "I freelance").patch).toEqual({ employment: "self_employed", income: "1099" });
    expect(answerFromRules("insurance", "through my job").patch).toEqual({ insurance: "employer" });
    expect(answerFromRules("insurance", "no insurance").patch).toEqual({ insurance: "none" });
    expect(answerFromRules("childAges", "4 and 9").patch).toEqual({ hasChildren: true, childAges: [4, 9] });
  });

  it("treats 'not sure' as a declined question, not as a no", () => {
    expect(answerFromRules("hasVehicle", "not sure yet")).toEqual({ patch: {}, declined: ["hasVehicle"] });
  });

  it("reads nothing when there is no open question or no match", () => {
    expect(answerFromRules(null, "yes").patch).toEqual({});
    expect(answerFromRules("insurance", "hmm").patch).toEqual({});
  });
});
