import { z } from "zod";
import { isStateCode } from "@/lib/states";

const state = z.string().refine(isStateCode).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

/** The profile as the server accepts it. Unknown keys are dropped. */
export const ProfileSchema = z
  .object({
    currentState: state,
    destinationState: state,
    moveDate: date,
    arrivedOn: date,
    zip: z.string().regex(/^\d{5}$/).optional(),
    employment: z.enum(["employee", "self_employed", "unemployed"]).optional(),
    income: z.enum(["w2", "1099", "both", "none"]).optional(),
    marital: z.enum(["single", "married", "divorced", "widowed"]).optional(),
    hasChildren: z.boolean().optional(),
    childAges: z.array(z.number().int().min(0).max(25)).max(12).optional(),
    insurance: z.enum(["employer", "marketplace", "medicaid", "other", "none"]).optional(),
    hasVehicle: z.boolean().optional(),
    vehicleRegisteredInCurrentState: z.boolean().optional(),
    aiConsent: z.boolean().optional(),
  })
  .strip();

/** Which model provider is configured. Google wins when both are set; null means rules only. */
export function aiProvider(): "google" | "anthropic" | null {
  if (process.env.GOOGLE_API_KEY) return "google";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return null;
}
