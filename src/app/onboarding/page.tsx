"use client";

import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { formatDate } from "@/lib/format";
import { RULES } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";
import { stateName, US_STATES } from "@/lib/states";
import { useCivio } from "@/lib/store";
import type { Profile } from "@/lib/types";

const STEPS = ["Your move", "Work & income", "Family", "Health insurance", "Vehicle", "Review"] as const;

type Option<T extends string | boolean> = { value: T; label: string; hint?: string };

/** A single-choice group. Choosing the selected option again clears it, so any optional question can be left blank. */
function Choice<T extends string | boolean>({
  label,
  options,
  value,
  onChange,
  optional = true,
  columns = 2,
}: {
  label: string;
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  optional?: boolean;
  columns?: 2 | 3;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3">
        <p id={id} className="font-medium">
          {label}
        </p>
        {optional && <span className="text-xs text-dark-muted">Optional</span>}
      </div>
      <div className={`mt-3 grid gap-2 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? undefined : option.value)}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left text-[0.9375rem] transition-colors duration-150 ${
                selected
                  ? "border-on-dark bg-on-dark font-semibold text-espresso"
                  : "border-espresso-line bg-espresso-raised text-on-dark"
              }`}
            >
              <span>
                {option.label}
                {option.hint && (
                  <span className={`block text-xs font-normal ${selected ? "text-muted" : "text-dark-muted"}`}>
                    {option.hint}
                  </span>
                )}
              </span>
              {selected && <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StateSelect({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`field mt-3 appearance-none ${error ? "border-on-dark" : ""}`}
      >
        <option value="">Select a state…</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-on-dark" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ChildAges({ ages, onChange }: { ages: number[]; onChange: (ages: number[]) => void }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const parsed = Number(draft);
  const valid = draft !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 25;

  const add = () => {
    if (!valid) return;
    onChange([...ages, parsed]);
    setDraft("");
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-medium">
          How old are they?
        </label>
        <span className="text-xs text-dark-muted">Optional</span>
      </div>
      <p className="mt-1 text-sm text-dark-muted">School rules depend on age. Add each child.</p>
      <div className="mt-3 flex gap-2">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Age, e.g. 7…"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="field max-w-40"
        />
        <button type="button" onClick={add} disabled={!valid} className="btn btn-ghost-dark">
          <Plus className="size-4" aria-hidden="true" /> Add
        </button>
      </div>
      {ages.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {ages.map((age, index) => (
            <li key={`${age}-${index}`}>
              <button
                type="button"
                onClick={() => onChange(ages.filter((_, i) => i !== index))}
                aria-label={`Remove child aged ${age}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-on-dark px-3.5 text-sm font-semibold text-espresso"
              >
                {age} {age === 1 ? "year" : "years"} <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-espresso-line py-3 last:border-b-0">
      <dt className="text-sm text-dark-muted">{label}</dt>
      <dd className="text-right text-[0.9375rem]">{value}</dd>
    </div>
  );
}

const TEXT: Record<string, string> = {
  employee: "Employee",
  self_employed: "Self-employed",
  unemployed: "Unemployed",
  w2: "W-2",
  "1099": "1099",
  both: "W-2 and 1099",
  none: "None",
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  employer: "Employer plan",
  marketplace: "Marketplace",
  medicaid: "Medicaid",
  other: "Other",
};
const show = (value: string | undefined) => (value ? (TEXT[value] ?? value) : "Skipped");
const yesNo = (value: boolean | undefined) => (value === undefined ? "Skipped" : value ? "Yes" : "No");

function Wizard({ initial, onDone }: { initial: Profile; onDone: (profile: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(initial);
  const [errors, setErrors] = useState<{ currentState?: string; destinationState?: string; zip?: string }>({});
  const set = (patch: Partial<Profile>) => setP((prev) => ({ ...prev, ...patch }));

  const taskCount = useMemo(() => generatePlan(p, RULES).length, [p]);
  const last = step === STEPS.length - 1;

  const next = () => {
    if (step === 0) {
      const found: typeof errors = {};
      if (!p.currentState) found.currentState = "Choose the state you live in now.";
      if (!p.destinationState) found.destinationState = "Choose the state you are moving to.";
      if (p.zip && !/^\d{5}$/.test(p.zip)) found.zip = "A ZIP code has 5 digits. Leave it blank if you don't know it yet.";
      setErrors(found);
      if (Object.keys(found).length > 0) return;
    }
    if (last) onDone(p);
    else setStep(step + 1);
  };

  return (
    <div className="on-dark min-h-dvh bg-espresso text-on-dark">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-6 sm:px-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16 lg:py-10">
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <Logo tone="dark" />
          <ol className="mt-10 hidden gap-1 lg:grid">
            {STEPS.map((name, index) => {
              const state = index === step ? "current" : index < step ? "done" : "todo";
              return (
                <li key={name}>
                  <button
                    type="button"
                    disabled={index > step}
                    onClick={() => setStep(index)}
                    aria-current={state === "current" ? "step" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] transition-colors duration-150 ${
                      state === "current" ? "bg-espresso-raised font-semibold" : "text-dark-muted"
                    }`}
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs ${
                        state === "done"
                          ? "bg-moss-fill text-espresso"
                          : state === "current"
                            ? "bg-on-dark text-espresso"
                            : "border border-espresso-line"
                      }`}
                    >
                      {state === "done" ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
                    </span>
                    {name}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 hidden rounded-2xl border border-espresso-line p-4 lg:block" aria-live="polite">
            <p className="mono-label text-dark-muted">Your plan so far</p>
            <p className="mt-2 font-display text-4xl font-semibold tabular-nums">{taskCount}</p>
            <p className="text-sm text-dark-muted">{taskCount === 1 ? "task" : "tasks"} matched by the rules</p>
          </div>
        </aside>

        <div className="max-w-2xl">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((name, index) => (
              <span
                key={name}
                className={`h-1.5 rounded-full transition-colors duration-200 ${
                  index === step ? "w-8 bg-on-dark" : index < step ? "w-4 bg-moss-fill" : "w-4 bg-espresso-line"
                }`}
              />
            ))}
          </div>
          <p className="mono-label mt-6 text-dark-muted">
            Step {step + 1} of {STEPS.length}
          </p>

          <form
            key={step}
            className="rise mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            {step === 0 && (
              <>
                <h1 className="text-4xl font-medium tracking-[-0.03em]">Where are you moving?</h1>
                <p className="mt-3 text-dark-muted">The two states decide which rules apply. Everything else is optional.</p>
                <div className="mt-8 grid gap-6 sm:grid-cols-2">
                  <StateSelect
                    label="Current state"
                    value={p.currentState}
                    onChange={(v) => set({ currentState: v })}
                    error={errors.currentState}
                  />
                  <StateSelect
                    label="Destination state"
                    value={p.destinationState}
                    onChange={(v) => set({ destinationState: v })}
                    error={errors.destinationState}
                  />
                  <div>
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="move-date" className="font-medium">
                        Planned move date
                      </label>
                      <span className="text-xs text-dark-muted">Optional</span>
                    </div>
                    <input
                      id="move-date"
                      type="date"
                      value={p.moveDate ?? ""}
                      onChange={(e) => set({ moveDate: e.target.value || undefined })}
                      className="field mt-3 [color-scheme:dark]"
                    />
                    <p className="mt-2 text-sm text-dark-muted">Used to turn “within 20 days” into a calendar date.</p>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="zip" className="font-medium">
                        New ZIP code
                      </label>
                      <span className="text-xs text-dark-muted">Optional</span>
                    </div>
                    <input
                      id="zip"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="e.g. 94110…"
                      value={p.zip ?? ""}
                      onChange={(e) => set({ zip: e.target.value.replace(/\D/g, "").slice(0, 5) || undefined })}
                      aria-invalid={Boolean(errors.zip)}
                      aria-describedby={errors.zip ? "zip-error" : undefined}
                      className="field mt-3"
                    />
                    {errors.zip && (
                      <p id="zip-error" role="alert" className="mt-2 text-sm">
                        {errors.zip}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="text-4xl font-medium tracking-[-0.03em]">How do you earn?</h1>
                <p className="mt-3 text-dark-muted">This decides withholding forms and estimated tax payments.</p>
                <div className="mt-8 grid gap-8">
                  <Choice
                    label="Employment"
                    columns={3}
                    value={p.employment}
                    onChange={(v) => set({ employment: v })}
                    options={[
                      { value: "employee", label: "Employee" },
                      { value: "self_employed", label: "Self-employed" },
                      { value: "unemployed", label: "Unemployed" },
                    ]}
                  />
                  <Choice
                    label="Income type"
                    value={p.income}
                    onChange={(v) => set({ income: v })}
                    options={[
                      { value: "w2", label: "W-2", hint: "Paid as an employee" },
                      { value: "1099", label: "1099", hint: "Contract or freelance" },
                      { value: "both", label: "Both" },
                      { value: "none", label: "None" },
                    ]}
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="text-4xl font-medium tracking-[-0.03em]">Who is moving with you?</h1>
                <p className="mt-3 text-dark-muted">Children of school age add enrollment tasks.</p>
                <div className="mt-8 grid gap-8">
                  <Choice
                    label="Marital status"
                    value={p.marital}
                    onChange={(v) => set({ marital: v })}
                    options={[
                      { value: "single", label: "Single" },
                      { value: "married", label: "Married" },
                      { value: "divorced", label: "Divorced" },
                      { value: "widowed", label: "Widowed" },
                    ]}
                  />
                  <Choice
                    label="Do you have children?"
                    value={p.hasChildren}
                    onChange={(v) => set({ hasChildren: v, childAges: v ? (p.childAges ?? []) : [] })}
                    options={[
                      { value: true, label: "Yes" },
                      { value: false, label: "No" },
                    ]}
                  />
                  {p.hasChildren === true && (
                    <div className="rise">
                      <ChildAges ages={p.childAges ?? []} onChange={(childAges) => set({ childAges })} />
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="text-4xl font-medium tracking-[-0.03em]">How are you insured today?</h1>
                <p className="mt-3 text-dark-muted">Each kind of coverage reacts differently to a change of state.</p>
                <div className="mt-8">
                  <Choice
                    label="Health insurance"
                    value={p.insurance}
                    onChange={(v) => set({ insurance: v })}
                    options={[
                      { value: "employer", label: "Employer", hint: "Through a job" },
                      { value: "marketplace", label: "Marketplace", hint: "HealthCare.gov or a state exchange" },
                      { value: "medicaid", label: "Medicaid" },
                      { value: "other", label: "Other" },
                      { value: "none", label: "None" },
                    ]}
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h1 className="text-4xl font-medium tracking-[-0.03em]">Are you bringing a vehicle?</h1>
                <p className="mt-3 text-dark-muted">Registration and license deadlines are usually the first to hit.</p>
                <div className="mt-8 grid gap-8">
                  <Choice
                    label="Do you own a vehicle?"
                    value={p.hasVehicle}
                    onChange={(v) =>
                      set({ hasVehicle: v, vehicleRegisteredInCurrentState: v ? p.vehicleRegisteredInCurrentState : undefined })
                    }
                    options={[
                      { value: true, label: "Yes" },
                      { value: false, label: "No" },
                    ]}
                  />
                  {p.hasVehicle === true && (
                    <div className="rise">
                      <Choice
                        label={`Is it registered in ${stateName(p.currentState)}?`}
                        value={p.vehicleRegisteredInCurrentState}
                        onChange={(v) => set({ vehicleRegisteredInCurrentState: v })}
                        options={[
                          { value: true, label: "Yes" },
                          { value: false, label: "No" },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <h1 className="text-4xl font-medium tracking-[-0.03em]">Check your answers</h1>
                <p className="mt-3 text-dark-muted">
                  Skipped answers are fine. Tasks that depend on them are marked “Needs verification”.
                </p>
                <dl className="mt-8 rounded-2xl border border-espresso-line px-5">
                  <ReviewRow label="Move" value={`${stateName(p.currentState)} → ${stateName(p.destinationState)}`} />
                  <ReviewRow label="Move date" value={p.moveDate ? formatDate(p.moveDate) : "Skipped"} />
                  <ReviewRow label="Employment" value={show(p.employment)} />
                  <ReviewRow label="Income type" value={show(p.income)} />
                  <ReviewRow label="Marital status" value={show(p.marital)} />
                  <ReviewRow
                    label="Children"
                    value={
                      p.hasChildren && p.childAges?.length ? `Yes, ages ${p.childAges.join(", ")}` : yesNo(p.hasChildren)
                    }
                  />
                  <ReviewRow label="Health insurance" value={show(p.insurance)} />
                  <ReviewRow label="Vehicle" value={yesNo(p.hasVehicle)} />
                </dl>
                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-espresso-line p-4">
                  <input
                    type="checkbox"
                    checked={p.aiConsent === true}
                    onChange={(e) => set({ aiConsent: e.target.checked })}
                    className="mt-1 size-4 accent-(--color-moss-fill)"
                  />
                  <span>
                    <span className="font-medium">Let the assistant use these answers</span>
                    <span className="mt-1 block text-sm text-dark-muted">
                      They are sent with your questions so answers fit your states and situation. You can turn this off
                      any time.
                    </span>
                  </span>
                </label>
              </>
            )}

            <div className="mt-10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="btn btn-ghost-dark"
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Back
              </button>
              <button type="submit" className="btn btn-on-dark">
                {last ? "Build my plan" : "Continue"} <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { ready, profile, saveProfile } = useCivio();

  if (!ready) {
    return <div className="min-h-dvh bg-espresso" aria-busy="true" />;
  }

  return (
    <Wizard
      initial={profile}
      onDone={(next) => {
        saveProfile(next);
        router.push("/dashboard");
      }}
    />
  );
}
