import { describe, expect, it } from "vitest";
import { parseAmount, summarizeCosts } from "@/lib/costs";
import { DEMO_PROFILE } from "@/lib/demo";
import { availableLetters, buildLetter, buildNotifyList, EMPTY_FIELDS } from "@/lib/documents";
import { checkArrival, stateFromCoords } from "@/lib/geo";
import { parseIntake } from "@/lib/intake/parse";
import { RULES } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";

const TODAY = "2026-11-14";
const plan = generatePlan(DEMO_PROFILE, RULES);
const position = (id: string) => plan.findIndex((task) => task.id === id);

describe("plan dependencies", () => {
  it("lists a task after the tasks it depends on", () => {
    expect(position("CA-VEH-RESIDENCY")).toBeGreaterThanOrEqual(0);
    expect(position("CA-VEH-RESIDENCY")).toBeLessThan(position("CA-VEH-DL"));
    expect(position("CA-VEH-INSURANCE")).toBeLessThan(position("CA-VEH-REG"));
  });

  it("every dependency points at a real rule and stays inside the plan", () => {
    const ids = new Set(RULES.map((rule) => rule.rule_id));
    for (const rule of RULES) for (const id of rule.depends_on ?? []) expect(ids.has(id), `${rule.rule_id} → ${id}`).toBe(true);
    const inPlan = new Set(plan.map((task) => task.id));
    for (const task of plan) for (const id of task.dependsOn) expect(inPlan.has(id)).toBe(true);
  });

  it("counts deadlines from the arrival date once it is confirmed", () => {
    const arrived = generatePlan({ ...DEMO_PROFILE, arrivedOn: "2027-01-20" }, RULES);
    expect(arrived.find((task) => task.id === "CA-VEH-DL")?.deadline?.date).toBe("2027-01-30");
  });
});

describe("free-text intake (rules fallback)", () => {
  it("reads the brief's example in Russian", () => {
    const { profile } = parseIntake("Переезжаю из Остина в Сан-Диего 1 января, есть машина, страховка от работодателя", TODAY);
    expect(profile).toMatchObject({
      currentState: "TX",
      destinationState: "CA",
      moveDate: "2027-01-01",
      hasVehicle: true,
      insurance: "employer",
    });
  });

  it("reads an English description", () => {
    const { profile } = parseIntake(
      "I'm moving from Austin, TX to San Diego on January 15, 2027 with my wife and two kids aged 7 and 3. I freelance, we have one car, and our insurance is through the marketplace.",
      TODAY,
    );
    expect(profile).toMatchObject({
      currentState: "TX",
      destinationState: "CA",
      moveDate: "2027-01-15",
      marital: "married",
      hasChildren: true,
      childAges: [7, 3],
      employment: "self_employed",
      income: "1099",
      hasVehicle: true,
      insurance: "marketplace",
    });
  });

  it("leaves out what was not said and understands a no", () => {
    const { profile } = parseIntake("Moving to California from Texas. No kids, no car.", TODAY);
    expect(profile).toEqual({ currentState: "TX", destinationState: "CA", hasChildren: false, childAges: [], hasVehicle: false });
  });

  it("does not mistake a count of cars for a date", () => {
    expect(parseIntake("есть 1 машина", TODAY).profile.moveDate).toBeUndefined();
  });
});

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
  it("builds the notify list from the profile", () => {
    const ids = buildNotifyList(DEMO_PROFILE, plan).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["usps", "irs", "auto-insurer", "dmv", "school", "bank"]));
    const noCarNoKids = buildNotifyList({ ...DEMO_PROFILE, hasVehicle: false, hasChildren: false }, plan).map((i) => i.id);
    expect(noCarNoKids).not.toContain("auto-insurer");
    expect(noCarNoKids).not.toContain("school");
  });

  it("keeps placeholders for anything the user has not typed", () => {
    const letter = buildLetter("address_change", { ...EMPTY_FIELDS, fullName: "Dana Reyes" }, DEMO_PROFILE, TODAY);
    expect(letter).toContain("Dana Reyes");
    expect(letter).toContain("[New address]");
    expect(letter).toContain("Jan 15, 2027");
    expect(availableLetters({ ...DEMO_PROFILE, hasChildren: false })).not.toContain("school_records");
  });
});
