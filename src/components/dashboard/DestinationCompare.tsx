"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { BudgetProjection } from "@/components/BudgetProjection";
import { compareBudget, dollars, type MoveBudget } from "@/lib/budget";
import { estimateBudget } from "@/lib/forecast/model";
import { stateName, US_STATES } from "@/lib/states";
import type { Profile } from "@/lib/types";
import styles from "./DestinationCompare.module.css";

type Scenario = { id: number; destination: string; budget: MoveBudget };
type ScenarioField = "incomeAfter" | "housingAfter" | "otherAfter" | "moving";

const FIELDS: { key: ScenarioField; label: string; unit: string }[] = [
  { key: "incomeAfter", label: "Take-home pay", unit: "per month" },
  { key: "housingAfter", label: "Housing & utilities", unit: "per month" },
  { key: "otherAfter", label: "Other living costs", unit: "per month" },
  { key: "moving", label: "Moving costs", unit: "one time" },
];

function signedAmount(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return dollars(0);
  return `${value < 0 ? "−" : "+"}${dollars(Math.abs(value))}`;
}

function sign(value: number | null) {
  return value === null || value === 0 ? "neutral" : value < 0 ? "loss" : "gain";
}

function startingBudget(profile: Profile): MoveBudget {
  const budget = profile.budget ?? {};
  return {
    incomeNow: budget.incomeNow,
    housingNow: budget.housingNow,
    otherNow: budget.otherNow,
  };
}

function destinationBudget(profile: Profile, destination: string): MoveBudget {
  if (destination === profile.destinationState) return { ...profile.budget };
  const baseline = startingBudget(profile);
  if (!destination || !profile.forecast) return baseline;
  const estimate = estimateBudget({ ...profile.forecast, destination, destinationMetro: undefined,
    offer: null, moving: "estimate" });
  return { ...estimate, ...baseline };
}

export function DestinationCompare({ profile }: { profile: Profile }) {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => [
    { id: 1, destination: profile.destinationState ?? "", budget: { ...(profile.budget ?? {}) } },
    { id: 2, destination: "", budget: startingBudget(profile) },
  ]);
  const results = scenarios.map((scenario) => ({ scenario, result: compareBudget(scenario.budget) }));
  const complete = results.filter(({ result }) => result.year !== null);
  const bestId = complete.length > 1
    ? complete.reduce((best, current) => current.result.year! > best.result.year! ? current : best).scenario.id
    : null;
  const canAdd = scenarios.length < 3 && scenarios.every((scenario) => scenario.destination !== "");

  function updateScenario(id: number, update: (scenario: Scenario) => Scenario) {
    setScenarios((current) => current.map((scenario) => scenario.id === id ? update(scenario) : scenario));
  }

  function addScenario() {
    setScenarios((current) => {
      if (current.length >= 3 || current.some((scenario) => !scenario.destination)) return current;
      const used = new Set(current.map((scenario) => scenario.destination));
      const destination = US_STATES.find(({ code }) => code !== profile.currentState && !used.has(code))?.code ?? "";
      return [...current, {
        id: Math.max(...current.map((scenario) => scenario.id)) + 1,
        destination,
        budget: destinationBudget(profile, destination),
      }];
    });
  }

  return (
    <section className={styles.section} aria-labelledby="compare-title">
      <div className={styles.head}>
        <div>
          <h2 id="compare-title">Compare destinations</h2>
        </div>
        <button className={styles.add} type="button" onClick={addScenario} disabled={!canAdd}>
          <Plus aria-hidden="true" size={17} /> Add destination
        </button>
      </div>
      <p className={styles.note}>
        {profile.forecast ? "New destinations start with your current pay, state costs and a fresh moving estimate. You can edit each amount."
          : "Enter your estimates for each destination to compare it with staying."}
      </p>

      <div className={styles.grid}>
        {results.map(({ scenario, result }, index) => {
          const isBest = bestId === scenario.id;
          const selectedElsewhere = new Set(scenarios.filter((other) => other.id !== scenario.id).map((other) => other.destination));
          const destinations = US_STATES.filter(({ code }) =>
            code !== profile.currentState && (code === scenario.destination || !selectedElsewhere.has(code)),
          );
          const title = scenario.destination ? stateName(scenario.destination) : `Destination ${index + 1}`;

          return (
            <article key={scenario.id} className={`${styles.card}${isBest ? ` ${styles.best}` : ""}`}>
              <div className={styles.cardHead}>
                <label>
                  <span className={styles.fieldLabel}>{index === 0 ? "Current plan" : "Destination"}</span>
                  <select
                    className={styles.select}
                    aria-label={`Destination ${index + 1}`}
                    value={scenario.destination}
                    onChange={(event) => {
                      const destination = event.currentTarget.value;
                      updateScenario(scenario.id, current => ({ ...current, destination,
                        budget: profile.forecast ? destinationBudget(profile, destination) : current.budget }));
                    }}
                  >
                    <option value="">Choose a state</option>
                    {destinations.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </label>
                {scenarios.length > 1 && index > 0 && (
                  <button
                    className={styles.remove}
                    type="button"
                    aria-label={`Remove ${title} comparison`}
                    onClick={() => setScenarios((current) => current.filter((item) => item.id !== scenario.id))}
                  >
                    <X aria-hidden="true" size={17} />
                  </button>
                )}
              </div>

              <div className={styles.results} aria-live="polite">
                <div className={styles.year}>
                  <div className={styles.yearHeading}>
                    <span>First year vs. staying</span>
                    {isBest && <span className={styles.bestBadge}>Best first-year result</span>}
                  </div>
                  <strong data-sign={sign(result.year)}>{signedAmount(result.year)}</strong>
                </div>
                <div>
                  <span>Monthly difference</span>
                  <strong data-sign={sign(result.monthly)}>{signedAmount(result.monthly)}</strong>
                </div>
                <div>
                  <span>Left after moving / mo</span>
                  <strong>{result.after === null ? "—" : dollars(result.after)}</strong>
                </div>
              </div>

              <div className={styles.outlook}>
                <BudgetProjection budget={scenario.budget} />
              </div>

              <div className={styles.fields}>
                {FIELDS.map(({ key, label, unit }) => (
                  <label key={key} className={styles.inputLabel}>
                    <span>{label}<small>{unit}</small></span>
                    <span className={styles.input}>
                      <span aria-hidden="true">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`${label} for ${title}`}
                        placeholder="—"
                        value={scenario.budget[key] ?? ""}
                        disabled={!scenario.destination}
                        onChange={(event) => {
                          const field = event.currentTarget;
                          const value = field.value !== "" && field.validity.valid ? field.valueAsNumber : undefined;
                          updateScenario(scenario.id, (current) => ({
                            ...current,
                            budget: { ...current.budget, [key]: value },
                          }));
                        }}
                      />
                    </span>
                  </label>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
