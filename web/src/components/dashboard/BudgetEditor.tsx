import { CheckCheck, ListChecks, SlidersHorizontal, Truck, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { BudgetProjection } from "@/components/BudgetProjection";
import { ForecastDetails } from "@/components/ForecastDetails";
import Link from "@/components/Link";
import { compareBudget, dollars, matchingIncome, monthlyRows, type MoveBudget } from "@/lib/budget";
import type { Profile } from "@/lib/types";

function signed(value: number | null) {
  if (value === null) return "—";
  return (value < 0 ? "−" : value > 0 ? "+" : "") + dollars(Math.abs(value));
}

type BudgetEditorProps = {
  profile: Profile;
  sample: boolean;
  onSave: (budget: MoveBudget) => void;
  onChecklist: () => void;
};

function QuickAction({ icon: Icon, label, onClick, primary }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button type="button" className="plan-action" onClick={onClick}>
      <span className={primary ? "plan-action-icon is-primary" : "plan-action-icon"}><Icon aria-hidden="true" /></span>
      <span>{label}</span>
    </button>
  );
}

export function BudgetEditor({ profile, sample, onSave, onChecklist }: BudgetEditorProps) {
  const [draft, setDraft] = useState<MoveBudget | null>(null);
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const budget = draft ?? profile.budget ?? {};
  const { now, after, monthly, year, moving } = compareBudget(budget);
  const target = matchingIncome(budget);

  function editAmount(name: "incomeNow" | "moving") {
    const input = formRef.current?.elements.namedItem(name);
    if (!(input instanceof HTMLInputElement)) return;
    input.focus({ preventScroll: true });
    const destination = name === "moving" ? input : formRef.current;
    destination?.scrollIntoView({ block: name === "moving" ? "center" : "start" });
  }

  function amount(key: keyof MoveBudget, label: string) {
    return (
      <label className="ledger-input">
        <span aria-hidden="true">$</span>
        <input name={key} aria-label={label} type="number" min="0" step="0.01" inputMode="decimal" placeholder="—"
          defaultValue={budget[key]} onChange={event => {
            const field = event.currentTarget;
            const value = field.value !== "" && field.validity.valid ? field.valueAsNumber : undefined;
            setDraft({ ...budget, [key]: value });
            setSaved(false);
          }} />
      </label>
    );
  }

  return (
    <section aria-label="Move budget comparison">
      <div className="budget-overview">
        <section className="budget-brief">
          <h2>At a glance</h2>
          <dl aria-live="polite">
            <div><dt>Monthly difference</dt><dd>{signed(monthly)}</dd></div>
            <div><dt>One-time moving costs</dt><dd>{moving === null ? "—" : dollars(moving)}</dd></div>
            <div><dt>Take-home pay to keep today’s balance</dt><dd>{target === null ? "—" : dollars(target)}<small> / mo</small></dd></div>
          </dl>
          <div className="plan-actions" role="group" aria-label="Plan actions">
            <QuickAction primary icon={SlidersHorizontal} label="Edit budget" onClick={() => editAmount("incomeNow")} />
            <QuickAction icon={Truck} label="Moving costs" onClick={() => editAmount("moving")} />
            <QuickAction icon={ListChecks} label="Checklist" onClick={onChecklist} />
          </div>
        </section>
        <BudgetProjection budget={budget} />
      </div>
      {profile.forecast && <ForecastDetails forecast={profile.forecast} budget={budget} />}
      {!sample && !profile.forecast && <p className="forecast-entry"><Link href="/onboarding">Estimate my budget with Civio →</Link></p>}
      <form key={version} id="budget" ref={formRef} className="ledger-panel" onSubmit={event => {
        event.preventDefault();
        if (draft) onSave(draft);
        setDraft(null);
        setSaved(true);
      }}>
        <div className="ledger-table-heading">
          <h2>Monthly budget</h2><span>USD per household</span>
        </div>
        <table className="ledger-table">
          <thead><tr><th scope="col">Category</th><th scope="col">Stay · {profile.currentState}</th><th scope="col">Move · {profile.destinationState}</th><th scope="col">Change</th></tr></thead>
          <tbody>{monthlyRows.map(row => {
            const a = budget[row.now];
            const b = budget[row.after];
            const change = a === undefined || b === undefined ? null : Math.round(b * 100) - Math.round(a * 100);
            const impact = (change ?? 0) * (row.now === "incomeNow" ? 1 : -1);
            return (
              <tr key={row.now}>
                <th scope="row">{row.label}</th>
                <td><span className="budget-column-label" aria-hidden="true">Stay · {profile.currentState}</span>{amount(row.now, row.label + " before moving")}</td>
                <td><span className="budget-column-label" aria-hidden="true">Move · {profile.destinationState}</span>{amount(row.after, row.label + " after moving")}</td>
                <td className={impact < 0 ? "text-risk" : impact > 0 ? "text-ok" : ""}><span className="budget-column-label" aria-hidden="true">Change</span>{signed(change)}</td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr><th scope="row">Left each month</th>
            <td><span className="budget-column-label" aria-hidden="true">Stay · {profile.currentState}</span>{now === null ? "—" : dollars(now)}</td>
            <td><span className="budget-column-label" aria-hidden="true">Move · {profile.destinationState}</span>{after === null ? "—" : dollars(after)}</td>
            <td><span className="budget-column-label" aria-hidden="true">Change</span>{signed(monthly)}</td>
          </tr></tfoot>
        </table>
        <div className="ledger-moving"><div><strong>One-time moving costs</strong><p>Movers, travel and nonrefundable fees</p></div>{amount("moving", "One-time moving costs")}</div>
        <div className="ledger-actions">
          <details><summary>How this is calculated</summary><p>Use income after payroll deductions. Count housing and utilities separately from other spending. Blank amounts are unknown. The first-year estimate assumes 12 months of steady income and spending.</p>
            {year !== null && monthly !== null && moving !== null && <p>12 × ({signed(monthly)}) − {dollars(moving)} = {signed(year)}</p>}
          </details>
          <div className="flex flex-wrap items-center gap-3">
            {draft && <button type="button" onClick={() => { setDraft(null); setVersion(version + 1); }}>Cancel</button>}
            <button className="ledger-save" type="submit" disabled={!draft}>{sample ? "Apply to sample" : "Save budget"}</button>
            {saved && <span role="status" className="ledger-saved"><CheckCheck aria-hidden="true" size={16} />{sample ? "Applied" : "Saved"}</span>}
          </div>
        </div>
      </form>
    </section>
  );
}
