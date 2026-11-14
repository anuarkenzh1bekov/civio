import { RULES } from "@/lib/rules/data";
import { evaluateRule } from "@/lib/rules/engine";
import { US_STATES } from "@/lib/states";
import { CATEGORY_LABEL, type Profile, type Rule, type Task } from "@/lib/types";

export type Retrieved = { rule: Rule; task: Task | null; score: number };

const STOP = new Set(
  "a an and are as at be by do does for from have how i if in is it me my of on or should the to what when which who will with you your need after before".split(" "),
);

/** Extra words people use for a topic that the rule text itself may not contain. */
const SYNONYMS: Record<string, string[]> = {
  taxes: ["tax", "taxes", "file", "filing", "irs", "return", "withholding", "income", "1099", "w-2", "w2"],
  health: ["health", "insurance", "coverage", "medical", "marketplace", "medicaid", "plan", "doctor"],
  vehicle: ["car", "vehicle", "dmv", "license", "licence", "registration", "register", "plates", "driver", "smog"],
  family: ["child", "children", "kid", "kids", "school", "enroll", "enrollment", "kindergarten", "immunization", "education"],
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length > 1 && !STOP.has(word));
}

function ruleText(rule: Rule): string {
  const t = rule.task_template;
  return [t.title, t.description, ...t.steps, ...t.documents, t.deadline?.label ?? "", rule.source_name].join(" ");
}

/**
 * Pick the rules most relevant to a question. Rules that apply to this user's
 * plan rank first; keyword overlap orders the rest. No embeddings: with a rule
 * base this small, lexical retrieval is exact and easy to audit.
 */
export function retrieveRules(question: string, profile: Profile | null, limit = 6): Retrieved[] {
  const words = new Set(tokens(question));
  const asksAboutOrder = /first|priorit|urgent|order|start|deadline|soon/i.test(question);

  const mentioned = US_STATES.filter(({ code, name }) =>
    new RegExp(`\\b${name}\\b`, "i").test(question) || new RegExp(`\\b${code}\\b`).test(question)
  );
  // A state named in a question can supply context even without a shared profile.
  const context = mentioned.length === 1 && mentioned[0]?.code !== profile?.destinationState
    ? { destinationState: mentioned[0]?.code }
    : profile;
  const scored: Retrieved[] = RULES.flatMap((rule) => {
    const task = context ? evaluateRule(rule, context) : null;
    if ((context && !task) || (!context && rule.state !== "US")) return [];
    let score = 0;
    for (const word of tokens(ruleText(rule))) if (words.has(word)) score += 1;
    const topic = SYNONYMS[rule.task_template.category] ?? [];
    if (topic.some((word) => words.has(word))) score += 4;
    if (task && (asksAboutOrder || score > 0)) score += asksAboutOrder ? 6 : 3;
    if (task && asksAboutOrder && task.deadline?.date) score += 3;
    return [{ rule, task, score }];
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** One rule as a plain-text knowledge entry for the model. */
export function renderRule({ rule, task }: Retrieved): string {
  const t = rule.task_template;
  const lines = [
    `[${rule.rule_id}] ${task?.title ?? t.title}`,
    `Module: ${CATEGORY_LABEL[t.category]} · Scope: ${rule.state === "US" ? "nationwide" : rule.state}`,
    `Applies to this user: ${task ? (task.status === "needs_verification" ? "possibly (needs verification)" : "yes") : "not in their plan"}`,
    `What it says: ${task?.description ?? t.description}`,
  ];
  const deadline = task?.deadline ?? (t.deadline ? { label: t.deadline.label, date: undefined } : null);
  if (deadline) {
    lines.push(`Deadline (from the source): ${deadline.label}${deadline.date ? ` · computed date: ${deadline.date}` : ""}`);
  } else {
    lines.push("Deadline: none recorded for this rule.");
  }
  lines.push(`Steps: ${(task?.steps ?? t.steps).join(" | ")}`);
  lines.push(`Documents: ${(task?.documents ?? t.documents).join(" | ")}`);
  if (t.financial) lines.push(`Money impact: ${task?.financial?.note ?? t.financial.note}`);
  if (task?.verificationNote) lines.push(`Verification note: ${task.verificationNote}`);
  lines.push(
    rule.verified
      ? `Source: ${rule.source_name} (checked ${rule.last_verified})`
      : `Source: ${rule.source_name}. NOT VERIFIED for this state: Civio only has the official directory, not the rule itself.`,
  );
  return lines.join("\n");
}
