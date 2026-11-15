import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { formatUsd, parseAmount, summarizeCosts } from "@/lib/costs";
import type { Task } from "@/lib/types";

const KIND_LABEL = { tax: "Tax", coverage: "Coverage", penalty: "Late penalty" } as const;

function AmountInput({ id, label, value, onChange }: { id: string; label: string; value: number | null; onChange: (amount: number | null) => void }) {
  // The text is the user's own while they type; the stored number is the parsed result.
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const invalid = draft.trim() !== "" && parseAmount(draft) === null;
  return (
    <label className="flex shrink-0 items-center gap-1.5">
      <span className="sr-only">{label}, amount in dollars</span>
      <span className="text-ink-muted" aria-hidden="true">$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={draft}
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseAmount(e.target.value);
          if (parsed !== null || e.target.value.trim() === "") onChange(parsed);
        }}
        className={`h-11 w-28 rounded-xl bg-panel px-3 text-right font-mono text-[0.9375rem] tabular-nums ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
          invalid ? "ring-risk" : "ring-line"
        }`}
      />
    </label>
  );
}

/**
 * Costs of the move. Civio holds no fee table: each line links to the official
 * page and the user types the amount they find there. Tax and coverage changes
 * are listed in words only.
 */
export function CostCalculator({
  tasks,
  amounts,
  onChange,
}: {
  tasks: readonly Task[];
  amounts: Readonly<Record<string, number>>;
  onChange: (id: string, amount: number | null) => void;
}) {
  const summary = useMemo(() => summarizeCosts(tasks, amounts), [tasks, amounts]);
  const hasFees = summary.lines.length > 0;
  const hasNotes = summary.changes.length > 0;
  if (!hasFees && !hasNotes) return null;

  return (
    <section id="costs" aria-labelledby="costs-title" className="mt-10 scroll-mt-6">
      <h2 id="costs-title" className="text-xl font-semibold tracking-tight">
        Costs
      </h2>
      {!hasFees && <p className="mt-1 text-sm text-ink-muted">No agency fees are listed for this plan.</p>}
      <div className={`mt-4 grid items-start gap-4 ${hasFees && hasNotes ? "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
        {hasFees && (
          <div className="tile overflow-hidden">
            <ul className="divide-y divide-line">
              {summary.lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="font-medium">{line.label}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{line.hint}</p>
                    <a
                      href={line.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"
                    >
                      {line.sourceName} <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                  <AmountInput id={`cost-${line.id}`} label={line.label} value={line.amount} onChange={(amount) => onChange(line.id, amount)} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line bg-panel/60 px-5 py-4">
              <p className="text-sm text-ink-muted">
                {summary.entered} of {summary.lines.length} amounts entered. Civio adds up what you type and does not
                estimate the rest.
              </p>
              <p className="font-display text-2xl font-semibold tabular-nums" aria-live="polite">
                {formatUsd(summary.total)}
              </p>
            </div>
          </div>
        )}

        {hasNotes && <div className="tile p-5">
          <h3 className="font-sans text-[0.9375rem] font-semibold">Tax and coverage details</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Check these requirements with the agency or insurer for your move.
          </p>
          <ul className={`cost-notes mt-4 grid gap-x-8 gap-y-3 text-sm ${hasFees ? "" : "lg:grid-cols-2"}`}>
            {summary.changes.map((change) => (
              <li key={change.ruleId} className="flex gap-3">
                <span className="mono-label mt-0.5 w-24 shrink-0 text-ink-muted">{KIND_LABEL[change.kind]}</span>
                <span>{change.note}</span>
              </li>
            ))}
          </ul>
        </div>}
      </div>
    </section>
  );
}
