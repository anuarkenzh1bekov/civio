import { describe, expect, it } from "vitest";
import { parseAmount, summarizeCosts } from "@/lib/costs";
import { DEMO_PROFILE } from "@/lib/demo";
import { availableLetters, buildLetter, EMPTY_FIELDS } from "@/lib/documents";
import { checkArrival, stateFromCoords } from "@/lib/geo";
import type { Task } from "@/lib/types";
import demoPlan from "./fixtures/demo-plan.json";

const TODAY = "2026-11-14";
// The backend's plan for DEMO_PROFILE (backend/tests cover how it is built).
const plan = demoPlan as Task[];

describe("cost calculator", () => {
  it("only sums what the user entered and never invents an amount", () => {
    const empty = summarizeCosts(plan, {});
    expect(empty.total).toBe(0);
    expect(empty.lines.length).toBeGreaterThan(0);
    expect(empty.lines.every((line) => line.amount === null && line.sourceUrl.startsWith("https://"))).toBe(true);

    const filled = summarizeCosts(plan, { "ca-dl-application": 45.5, "ca-reg-fees": 300, "tx-dl-fee": 99 });
    expect(filled.total).toBe(345.5); // the Texas line is not in a Texas → California plan
    expect(filled.entered).toBe(2);
  });

  it("shows tax changes as text, not numbers", () => {
    const { changes } = summarizeCosts(plan, {});
    expect(changes.some((change) => change.kind === "tax")).toBe(true);
  });

  it("parses typed amounts", () => {
    expect(parseAmount("$1,234.50")).toBe(1234.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("arrival check", () => {
  it("places known cities in their state", () => {
    expect(stateFromCoords(32.7157, -117.1611)?.best).toBe("CA"); // San Diego
    expect(stateFromCoords(30.2672, -97.7431)?.best).toBe("TX"); // Austin
    expect(stateFromCoords(0, 0)).toBeNull();
  });

  it("only reports arrival in the destination state", () => {
    const sanDiego = stateFromCoords(32.7157, -117.1611)!;
    const austin = stateFromCoords(30.2672, -97.7431)!;
    expect(checkArrival(sanDiego, "TX", "CA")).toBe("arrived");
    expect(checkArrival(austin, "TX", "CA")).toBe("still_home");
    expect(checkArrival(austin, "NY", "CA")).toBe("elsewhere");
  });
});

describe("documents", () => {
  it("keeps placeholders for anything the user has not typed", () => {
    const letter = buildLetter("address_change", { ...EMPTY_FIELDS, fullName: "Dana Reyes" }, DEMO_PROFILE, TODAY);
    expect(letter).toContain("Dana Reyes");
    expect(letter).toContain("[New address]");
    expect(letter).toContain("Jan 15, 2027");
    expect(availableLetters({ ...DEMO_PROFILE, hasChildren: false })).not.toContain("school_records");
  });
});
