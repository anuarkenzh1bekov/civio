"use client";

import { useState } from "react";
import { compareBudget, dollars, type MoveBudget } from "@/lib/budget";

export function BudgetProjection({ budget }: { budget?: MoveBudget }) {
  const [months, setMonths] = useState(12);
  const { monthly, moving } = compareBudget(budget);
  const values = monthly === null || moving === null ? [] :
    Array.from({ length: months + 1 }, (_, month) => monthly * month - moving);
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const scale = high - low || 1;
  const zero = high / scale * 100;
  const final = values.at(-1);
  return (
    <section className="projection" aria-label="Cumulative cash difference">
      <div className="projection-head"><h2>First-year outlook</h2>
        <div className="period-switch" aria-label="Projection period">
          {[6, 12].map(n => <button type="button" key={n} aria-pressed={months === n} onClick={() => setMonths(n)}>{n} mo</button>)}
        </div>
      </div>
      <p className="projection-value" aria-live="polite">{final === undefined ? "—" : dollars(final).replace("-", "−")}</p>
      <p className="projection-caption">{final === undefined ? "Add income, living costs and moving costs to see the projection." : `Cash difference after ${months} months, including the move`}</p>
      {values.length > 0 && <div className="projection-plot" role="img" aria-label={`Cumulative difference starts at ${dollars(values[0]!)} on moving day and reaches ${dollars(final!)} in month ${months}.`}>
        <div className="projection-bars">
          <div className="projection-zero" style={{ top: zero + "%" }} />
          {values.map((value, i) => <div className="projection-column" data-sign={Math.sign(value)} key={i}>
            <span style={{ top: (value > 0 ? (high - value) / scale * 100 : zero) + "%", height: Math.abs(value) / scale * 100 + "%" }} />
          </div>)}
        </div>
        <div className="projection-axis"><span>Move day</span><span>Month {months / 2}</span><span>Month {months}</span></div>
      </div>}
    </section>
  );
}
