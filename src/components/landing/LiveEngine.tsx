"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryIcon } from "@/components/ui";
import { DEMO_PROFILE } from "@/lib/demo";
import { formatShortDate } from "@/lib/format";
import { RULES } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";
import { CATEGORY_LABEL, type Category, type Profile } from "@/lib/types";

const DESTINATIONS = [
  { code: "CA", label: "California" },
  { code: "TX", label: "Texas" },
  { code: "OR", label: "Oregon" },
];

type Toggle = { key: string; label: string; on: (p: Profile) => boolean; flip: (p: Profile) => Profile };

const TOGGLES: Toggle[] = [
  {
    key: "car",
    label: "Owns a car",
    on: (p) => p.hasVehicle === true,
    flip: (p) => ({ ...p, hasVehicle: !p.hasVehicle }),
  },
  {
    key: "kids",
    label: "Kids in school",
    on: (p) => p.hasChildren === true,
    flip: (p) => (p.hasChildren ? { ...p, hasChildren: false, childAges: [] } : { ...p, hasChildren: true, childAges: [7] }),
  },
  {
    key: "1099",
    label: "1099 income",
    on: (p) => p.income === "both",
    flip: (p) => ({ ...p, income: p.income === "both" ? "w2" : "both" }),
  },
  {
    key: "marketplace",
    label: "Marketplace plan",
    on: (p) => p.insurance === "marketplace",
    flip: (p) => ({ ...p, insurance: p.insurance === "marketplace" ? "employer" : "marketplace" }),
  },
];

const ORDER: Category[] = ["taxes", "health", "vehicle", "family"];

/** The real rule engine, running in the page. Flip an answer and the plan changes. */
export function LiveEngine() {
  const [profile, setProfile] = useState<Profile>({ ...DEMO_PROFILE, currentState: "NY" });
  const plan = useMemo(() => generatePlan(profile, RULES), [profile]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10">
      <div className="rounded-panel border border-line bg-card p-6 shadow-card">
        <p className="mono-label text-ink-muted">The change</p>
        <p className="mt-3 font-display text-2xl font-semibold tracking-tight">Moving to</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Destination state">
          {DESTINATIONS.map((d) => {
            const active = profile.destinationState === d.code;
            return (
              <button
                key={d.code}
                type="button"
                aria-pressed={active}
                onClick={() => setProfile((p) => ({ ...p, destinationState: d.code }))}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-150 ${
                  active ? "border-brand bg-brand text-on-brand" : "border-line bg-panel text-ink"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <p className="mono-label mt-8 text-ink-muted">About the household</p>
        <div className="mt-3 grid gap-2">
          {TOGGLES.map((t) => {
            const active = t.on(profile);
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={active}
                onClick={() => setProfile(t.flip)}
                className={`flex min-h-12 items-center justify-between rounded-2xl border px-4 text-left text-[0.9375rem] font-medium transition-colors duration-150 ${
                  active ? "border-brand-tint bg-brand-soft text-ink" : "border-line bg-panel text-ink-muted"
                }`}
              >
                {t.label}
                <span
                  className={`grid size-5 place-items-center rounded-full border ${
                    active ? "border-brand bg-brand text-on-brand" : "border-ink-faint"
                  }`}
                >
                  {active && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div aria-live="polite">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-6xl font-semibold tracking-tight tabular-nums">{plan.length}</span>
          <span className="text-ink-muted">obligations change with this move</span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ORDER.map((category) => {
            const tasks = plan.filter((t) => t.category === category);
            return (
              <div key={category} className="rounded-card border border-line bg-panel p-5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <CategoryIcon category={category} className="size-4 text-ink-muted" />
                    {CATEGORY_LABEL[category]}
                  </span>
                  <span className="font-mono text-xs text-ink-muted tabular-nums">{tasks.length}</span>
                </div>
                {tasks.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-muted">Nothing to do here.</p>
                ) : (
                  <ul className="mt-4 grid gap-2.5">
                    {tasks.map((task) => (
                      <li key={task.id} className="flex items-start justify-between gap-3 text-sm">
                        <span>{task.title}</span>
                        {task.deadline?.date ? (
                          <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
                            {formatShortDate(task.deadline.date)}
                          </span>
                        ) : task.status === "needs_verification" ? (
                          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                            Verify
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          Dates assume a move on {formatShortDate(profile.moveDate)}. Oregon has no verified rules yet, so Civio flags
          those tasks instead of guessing.
        </p>
      </div>
    </div>
  );
}
