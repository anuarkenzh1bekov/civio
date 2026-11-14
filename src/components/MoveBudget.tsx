import { compareBudget, difference, dollars, matchingIncome, monthlyRows, type MoveBudget } from "@/lib/budget";

type EditorProps = { budget: MoveBudget; onChange: (next: MoveBudget) => void; before: string; after: string };

export function BudgetFields({ budget, onChange, before, after }: EditorProps) {
  function field(key: keyof MoveBudget, label: string) {
    return (
      <input aria-label={label} type="number" inputMode="decimal" min="0" step="0.01"
        className="w-full min-w-0 rounded-xl border border-current/30 bg-transparent px-3 py-2.5 font-mono tabular-nums"
        placeholder="USD" defaultValue={budget[key]}
        onChange={(event) => {
          const input = event.currentTarget;
          onChange({ ...budget, [key]: input.validity.valid && input.value !== "" ? input.valueAsNumber : undefined });
        }} />
    );
  }

  return (
    <div>
      <p className="text-sm leading-relaxed">Use monthly household amounts in USD. Take-home income is after taxes and payroll deductions. Include food, transport, insurance paid separately and other spending in living costs.</p>
      <div className="mt-4 grid grid-cols-[minmax(0,1.15fr)_repeat(2,minmax(0,1fr))] items-center gap-2 text-sm">
        <span />
        <strong>Now · {before}</strong><strong>After · {after}</strong>
        {monthlyRows.map((row) => (
          <div className="contents" key={row.now}>
            <span>{row.label}</span>
            {field(row.now, row.label + " now")}
            {field(row.after, row.label + " after moving")}
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-2 text-sm">
        <strong>One-time moving costs</strong>
        {field("moving", "One-time moving costs")}
        <p>Include movers, travel and nonrefundable setup fees you pay. Leave unknown amounts blank. Enter 0 for no cost.</p>
      </div>
    </div>
  );
}

export function BudgetSummary({ budget, sample = false }: { budget?: MoveBudget; sample?: boolean }) {
  const { now, after, monthly, moving, year } = compareBudget(budget);
  const target = matchingIncome(budget);
  return (
    <div className="on-stage rounded-panel bg-stage-raised p-5 text-left text-on-stage sm:p-7">
      <p className="mono-label text-brand-bright">{sample ? "Example household · first 12 months" : "Your estimate · first 12 months"}</p>
      <h2 className="mt-3 text-4xl leading-tight tracking-tight sm:text-5xl">{year === null ? "Compare your move" : difference(year)}</h2>
      <p className="mt-2 text-sm text-on-stage-muted">{year !== null ? "Cash left over compared with staying, including moving costs." : monthly !== null ? "Enter one-time moving costs to see your first-year difference." : "Fill in both monthly budgets to see how much more or less you could keep."}</p>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-stage-line pt-4 sm:grid-cols-4">
        {[
          ["Left now / month", now === null ? "—" : dollars(now)],
          ["Left after / month", after === null ? "—" : dollars(after)],
          ["Monthly change", monthly === null ? "—" : difference(monthly)],
          ["Moving costs", moving === null ? "—" : dollars(moving)],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-on-stage-muted">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      {year !== null && monthly !== null && moving !== null && (
        <p className="mt-4 text-sm text-on-stage-muted">12 months × ({dollars(monthly)}) − {dollars(moving)} = {dollars(year)}. Assumes steady income and spending.</p>
      )}
      {target !== null && (
        <p className="mt-4 border-t border-stage-line pt-4 text-sm">To keep at least your current monthly balance after the move, aim for <strong>{dollars(target)} in monthly take-home pay</strong> at your estimated spending level.</p>
      )}
    </div>
  );
}
