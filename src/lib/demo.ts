import type { Profile } from "@/lib/types";

/** The demo scenario from the brief: a family moving from Texas to California. */
export const DEMO_PROFILE: Profile = {
  currentState: "TX",
  // Illustrative household estimates, independent of regional prices.
  budget: { incomeNow: 5400, incomeAfter: 5900, housingNow: 1600, housingAfter: 2450, otherNow: 1800, otherAfter: 1950, moving: 3200 },
  drives: true,
  destinationState: "CA",
  moveDate: "2027-01-15",
  zip: "94110",
  employment: "employee",
  income: "both",
  marital: "married",
  hasChildren: true,
  childAges: [7, 3],
  insurance: "marketplace",
  hasVehicle: true,
  vehicleRegisteredInCurrentState: true,
  aiConsent: true,
};

/** Tasks already ticked off in the demo so the dashboard shows real progress. */
export const DEMO_DONE: string[] = ["US-TAX-8822", "CA-TAX-DE4", "CA-VEH-INSURANCE"];
