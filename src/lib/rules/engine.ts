import { stateName } from "@/lib/states";
import type {
  Condition,
  FactKey,
  FactValue,
  Profile,
  Rule,
  Task,
  TaskTemplate,
} from "@/lib/types";

/** What the user would have to answer for a fact to become known. */
const FACT_QUESTION: Record<FactKey, string> = {
  moving_between_states: "your current and destination state",
  employment: "your employment type",
  income: "your income type",
  has_self_employment_income: "your employment or income type",
  has_children: "whether you have children",
  has_school_age_child: "your children's ages",
  insurance: "your health insurance type",
  has_vehicle: "whether you own a vehicle",
  drives: "whether you will drive after the move",
  has_vehicle_or_drives: "whether you will bring a vehicle or drive after the move",
  destination_state: "your destination state",
  origin_state: "your current state",
};

/** Derive every fact from the profile. `undefined` means unknown, which is
 *  different from false: a skipped question never counts as a "no". */
export function deriveFacts(profile: Profile): Record<FactKey, FactValue> {
  const { currentState, destinationState, employment, income, hasChildren, childAges } = profile;

  let selfEmployment: FactValue;
  if (employment === "self_employed" || income === "1099" || income === "both") selfEmployment = true;
  else if (employment !== undefined && income !== undefined) selfEmployment = false;

  let schoolAge: FactValue;
  if (hasChildren === false) schoolAge = false;
  else if (hasChildren === true && childAges && childAges.length > 0) {
    // Kindergarten through grade 12. Conditions on exact cut-off dates live in the rule text.
    schoolAge = childAges.some((age) => age >= 5 && age <= 18);
  }

  return {
    moving_between_states:
      currentState && destinationState ? currentState !== destinationState : undefined,
    employment,
    income,
    has_self_employment_income: selfEmployment,
    has_children: hasChildren,
    has_school_age_child: schoolAge,
    insurance: profile.insurance,
    has_vehicle: profile.hasVehicle,
    drives: profile.drives,
    has_vehicle_or_drives: profile.hasVehicle || profile.drives ? true
      : profile.hasVehicle === false && profile.drives === false ? false : undefined,
    destination_state: destinationState,
    origin_state: currentState,
  };
}

type Verdict = "match" | "no_match" | "unknown";

function test(condition: Condition, value: FactValue): Verdict {
  if (value === undefined) return "unknown";
  switch (condition.op) {
    case "eq":
      return value === condition.value ? "match" : "no_match";
    case "in":
      return condition.value.includes(String(value)) ? "match" : "no_match";
    case "not_in":
      return condition.value.includes(String(value)) ? "no_match" : "match";
  }
}

function fill(text: string, profile: Profile): string {
  return text
    .replaceAll("{destination}", stateName(profile.destinationState))
    .replaceAll("{origin}", profile.currentState ? stateName(profile.currentState) : "your previous state");
}

function addDays(isoDate: string, days: number): string | undefined {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildTask(rule: Rule, profile: Profile, missing: FactKey[]): Task {
  const t: TaskTemplate = rule.task_template;

  let deadline: Task["deadline"] = null;
  if (t.deadline) {
    // Once the user has confirmed arrival, that date replaces the planned one.
    const base = profile.arrivedOn ?? profile.moveDate;
    const date =
      t.deadline.daysAfterMove !== undefined && base ? addDays(base, t.deadline.daysAfterMove) : undefined;
    deadline = { label: fill(t.deadline.label, profile), date };
  }

  let verificationNote: string | undefined;
  if (!rule.verified) {
    verificationNote =
      "Civio has no verified rule for this state yet. Confirm the requirement and any deadline on the official site before acting.";
  } else if (missing.length > 0) {
    const asks = [...new Set(missing.map((fact) => FACT_QUESTION[fact]))];
    verificationNote = `This may apply to you. Add ${asks.join(" and ")} to your profile to confirm.`;
  }

  return {
    id: rule.rule_id,
    ruleId: rule.rule_id,
    title: fill(t.title, profile),
    category: t.category,
    priority: t.priority,
    description: fill(t.description, profile),
    steps: t.steps.map((s) => fill(s, profile)),
    documents: t.documents.map((d) => fill(d, profile)),
    deadline,
    financial: t.financial ? { ...t.financial, note: fill(t.financial.note, profile) } : null,
    source: {
      name: rule.source_name,
      url: rule.source_url,
      lastVerified: rule.last_verified,
      effectiveDate: rule.effective_date,
    },
    dependsOn: rule.depends_on ?? [],
    daysAfterMove: t.deadline?.daysAfterMove,
    status: verificationNote ? "needs_verification" : "pending",
    verificationNote,
  };
}

/** Evaluate one rule. Returns a task, or null when the rule does not apply. */
export function evaluateRule(rule: Rule, profile: Profile): Task | null {
  if (profile.currentState && profile.currentState === profile.destinationState) return null;
  // A state-scoped rule only ever applies to a known, matching state.
  if (rule.state !== "US") {
    const side = rule.state_role === "origin" ? profile.currentState : profile.destinationState;
    if (side !== rule.state) return null;
  }

  const facts = deriveFacts(profile);
  const missing: FactKey[] = [];
  for (const condition of rule.conditions) {
    const verdict = test(condition, facts[condition.fact]);
    if (verdict === "no_match") return null;
    if (verdict === "unknown") missing.push(condition.fact);
  }
  return buildTask(rule, profile, missing);
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tasks with a computed date first (soonest first), then by priority. */
export function compareTasks(a: Task, b: Task): number {
  const ad = a.deadline?.date;
  const bd = b.deadline?.date;
  if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
  if (ad && !bd) return -1;
  if (!ad && bd) return 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

/** Keep the deadline order, but never list a task before one it depends on. */
function orderByDependencies(sorted: Task[]): Task[] {
  const byId = new Map(sorted.map((task) => [task.id, task]));
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const out: Task[] = [];
  const place = (task: Task) => {
    if (placed.has(task.id) || visiting.has(task.id)) return; // a cycle in the data falls back to deadline order
    visiting.add(task.id);
    for (const id of task.dependsOn) {
      const dependency = byId.get(id);
      if (dependency) place(dependency);
    }
    visiting.delete(task.id);
    placed.add(task.id);
    out.push(task);
  };
  sorted.forEach(place);
  return out;
}

export function generatePlan(profile: Profile, rules: readonly Rule[]): Task[] {
  const tasks: Task[] = [];
  for (const rule of rules) {
    const task = evaluateRule(rule, profile);
    if (task) tasks.push(task);
  }
  const ids = new Set(tasks.map((task) => task.id));
  // A dependency that is not part of this plan does not block anything.
  for (const task of tasks) task.dependsOn = task.dependsOn.filter((id) => ids.has(id));
  return orderByDependencies(tasks.sort(compareTasks));
}
