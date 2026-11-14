import { describe, expect, it } from "vitest";
import { DEMO_PROFILE } from "@/lib/demo";
import type { Profile } from "@/lib/types";
import { RULES } from "./data";
import { generatePlan } from "./engine";

const ids = (profile: Profile) => generatePlan(profile, RULES).map((t) => t.id);

describe("rule engine", () => {
  it("every rule carries a source and a verification date", () => {
    for (const rule of RULES) {
      expect(rule.source_url, rule.rule_id).toMatch(/^https:\/\//);
      expect(rule.last_verified, rule.rule_id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(new Set(RULES.map((r) => r.rule_id)).size).toBe(RULES.length);
  });

  it("builds the Texas to California demo plan", () => {
    const plan = ids(DEMO_PROFILE);
    expect(plan).toEqual(
      expect.arrayContaining([
        "CA-VEH-REG",
        "CA-VEH-DL",
        "CA-VEH-INSURANCE",
        "CA-HEALTH-COVEREDCA",
        "CA-FAM-SCHOOL",
        "CA-TAX-540NR-IN",
        "CA-TAX-DE4",
        "US-TAX-1040ES",
        "US-TAX-8822",
      ]),
    );
    expect(plan).not.toContain("TX-VEH-REG");
    expect(plan).not.toContain("US-VEH-STATE-CHECK");
  });

  it("computes deadlines only from rule data and the move date", () => {
    const plan = generatePlan(DEMO_PROFILE, RULES);
    const reg = plan.find((t) => t.id === "CA-VEH-REG");
    expect(DEMO_PROFILE.moveDate).toBe("2027-01-15");
    expect(reg?.deadline?.date).toBe("2027-02-04");

    const noDate = generatePlan({ ...DEMO_PROFILE, moveDate: undefined }, RULES);
    expect(noDate.find((t) => t.id === "CA-VEH-REG")?.deadline).toEqual({
      label: "Within 20 days of establishing residency or accepting employment in California",
      date: undefined,
    });
  });

  it("drops education tasks when there are no children", () => {
    const plan = ids({ ...DEMO_PROFILE, hasChildren: false, childAges: [] });
    expect(plan).not.toContain("CA-FAM-SCHOOL");
  });

  it("drops vehicle tasks when there is no vehicle", () => {
    const plan = ids({ ...DEMO_PROFILE, hasVehicle: false });
    expect(plan.filter((id) => id.includes("VEH"))).toEqual([]);
  });

  it("marks a task as needs verification when a required answer was skipped", () => {
    const plan = generatePlan({ ...DEMO_PROFILE, hasVehicle: undefined }, RULES);
    const reg = plan.find((t) => t.id === "CA-VEH-REG");
    expect(reg?.status).toBe("needs_verification");
    expect(reg?.verificationNote).toContain("whether you own a vehicle");
  });

  it("asks for children's ages instead of guessing", () => {
    const plan = generatePlan({ ...DEMO_PROFILE, childAges: [] }, RULES);
    expect(plan.find((t) => t.id === "CA-FAM-SCHOOL")?.status).toBe("needs_verification");
  });

  it("falls back to a needs-verification task for states without verified rules", () => {
    const plan = generatePlan({ ...DEMO_PROFILE, destinationState: "OR" }, RULES);
    const check = plan.find((t) => t.id === "US-VEH-STATE-CHECK");
    expect(check?.status).toBe("needs_verification");
    expect(check?.title).toContain("Oregon");
    expect(check?.deadline).toBeNull();
  });

  it("returns nothing state-specific when the destination is unknown", () => {
    const plan = ids({ hasVehicle: true });
    expect(plan.some((id) => id.startsWith("CA-") || id.startsWith("TX-"))).toBe(false);
  });
});
