export type StateCode = string;

export type Employment = "employee" | "self_employed" | "unemployed";
export type Income = "w2" | "1099" | "both" | "none";
export type Marital = "single" | "married" | "divorced" | "widowed";
export type Insurance = "employer" | "marketplace" | "medicaid" | "other" | "none";

/** Everything the questionnaire can collect. Every field is optional: a skipped
 *  answer stays undefined and the rule engine treats it as unknown, never as "no". */
export type Profile = {
  currentState?: StateCode;
  destinationState?: StateCode;
  moveDate?: string; // yyyy-mm-dd
  zip?: string;
  employment?: Employment;
  income?: Income;
  marital?: Marital;
  hasChildren?: boolean;
  childAges?: number[];
  insurance?: Insurance;
  hasVehicle?: boolean;
  vehicleRegisteredInCurrentState?: boolean;
  /** Set when the user confirms they are already in the destination state.
   *  Deadlines then count from this date instead of the planned move date. */
  arrivedOn?: string; // yyyy-mm-dd
  /** The user allowed the assistant to read this profile. */
  aiConsent?: boolean;
};

export type Category = "taxes" | "health" | "vehicle" | "family";
export type Priority = "high" | "medium" | "low";

/** Facts are what conditions test. Some are profile fields, some are derived. */
export type FactKey =
  | "moving_between_states"
  | "employment"
  | "income"
  | "has_self_employment_income"
  | "has_children"
  | "has_school_age_child"
  | "insurance"
  | "has_vehicle"
  | "destination_state"
  | "origin_state";

export type FactValue = string | boolean | undefined;

export type Condition =
  | { fact: FactKey; op: "eq"; value: string | boolean }
  | { fact: FactKey; op: "in"; value: string[] }
  | { fact: FactKey; op: "not_in"; value: string[] };

export type Deadline = {
  /** Wording taken from the official source. Always shown. */
  label: string;
  /** When set, a calendar date is computed as moveDate + days. The move date
   *  stands in for the legal trigger named in `label`, and the UI says so. */
  daysAfterMove?: number;
};

export type FinancialImpact = {
  kind: "fee" | "penalty" | "tax" | "coverage";
  note: string;
};

export type TaskTemplate = {
  title: string;
  category: Category;
  priority: Priority;
  description: string;
  steps: string[];
  documents: string[];
  deadline?: Deadline;
  financial?: FinancialImpact;
};

export type Rule = {
  rule_id: string;
  /** "US" for federal / nationwide rules, otherwise a two-letter state code. */
  state: StateCode | "US";
  /** Which side of the move a state rule is matched against. Default: destination. */
  state_role?: "destination" | "origin";
  conditions: Condition[];
  /** Rule ids that have to be done first. Only ids present in the same plan count. */
  depends_on?: string[];
  task_template: TaskTemplate;
  source_name: string;
  source_url: string;
  last_verified: string; // yyyy-mm-dd
  effective_date?: string;
  /** false = we have no verified state-specific rule. The task is always
   *  emitted as "needs verification" and points at an official directory. */
  verified: boolean;
};

export type TaskStatus = "pending" | "needs_verification" | "done";

export type Task = {
  id: string;
  ruleId: string;
  title: string;
  category: Category;
  priority: Priority;
  description: string;
  steps: string[];
  documents: string[];
  deadline: { label: string; date?: string } | null;
  financial: FinancialImpact | null;
  source: { name: string; url: string; lastVerified: string; effectiveDate?: string };
  /** Status decided by the engine. The user's "done" is layered on top. */
  status: Exclude<TaskStatus, "done">;
  /** Tasks in this plan that come first (ids). Empty when nothing blocks it. */
  dependsOn: string[];
  /** Days after the move the rule allows, when the rule has a countable deadline. */
  daysAfterMove?: number;
  /** Why the task needs verification, in plain words. */
  verificationNote?: string;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  taxes: "Taxes",
  health: "Health insurance",
  vehicle: "Vehicle",
  family: "Family & education",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  needs_verification: "Needs verification",
  done: "Done",
};
