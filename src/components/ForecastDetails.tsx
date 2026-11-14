import { compareBudget, dollars, type MoveBudget } from "@/lib/budget";
import { money } from "@/lib/forecast/conversation";
import { forecastOutcome, forecastSources, movingGuide, type Forecast } from "@/lib/forecast/model";

function signed(cents: number) {
  return (cents < 0 ? "−" : cents > 0 ? "+" : "") + dollars(Math.abs(cents));
}

export function yearText(year: readonly [number, number] | null) {
  if (!year) return "Needs moving cost";
  return year[0] === year[1] ? signed(year[0]) : signed(year[0]) + " to " + signed(year[1]);
}

export function ForecastDetails({ forecast: f, budget }: { forecast: Forecast; budget: MoveBudget }) {
  const outcome = forecastOutcome(f, budget);
  const { monthly } = compareBudget(budget);
  const guide = movingGuide(f.origin, f.destination, f.bedrooms);
  const months = outcome.months;
  const payback = !outcome.costs ? "Needs moving cost" : outcome.costs[1] === 0 ? "No upfront cost"
    : monthly === null ? "Needs monthly budget" : !months ? "No monthly savings"
    : (months[0] === months[1] ? String(months[0]) : months.join("–")) + (months[1] === 1 ? " month" : " months");
  return <section className="forecast-details" aria-label="Move forecast">
    <h2>What it takes to break even</h2>
    <dl>
      <div><dt>First year, including the move</dt><dd>{yearText(outcome.year)}</dd></div>
      <div><dt>Time to recover moving costs</dt><dd>{payback}</dd></div>
      <div><dt>{outcome.grossTarget !== null ? "Salary to keep today’s monthly balance" : "Monthly take-home to keep today’s balance"}</dt>
        <dd>{outcome.grossTarget !== null ? money(outcome.grossTarget) + " / yr" : outcome.target !== null ? dollars(outcome.target) + " / mo" : "Needs monthly budget"}</dd></div>
      {outcome.firstYearGross !== null && <div><dt>Salary to break even in year one</dt><dd>{money(outcome.firstYearGross)} / yr</dd></div>}
    </dl>
    <details className="forecast-sources"><summary>Assumptions and sources</summary>
      <p>Rent uses 2020–24 median gross rent for your home size. It includes tenant-paid utilities. An unavailable metro value uses the state median. <a href={forecastSources.rent}>US Census, B25031</a></p>
      <p>Household size sets a 2024 spending basket for food, clothing, transportation, healthcare, leisure, personal care and education. State goods and other-service price indexes scale those amounts. Childcare, debt and savings need your own figures. <a href={forecastSources.spending}>BLS spending tables</a> · <a href={forecastSources.prices}>BEA state prices</a></p>
      {f.payMode === "gross" ? <p>Pay uses one W-2 earner, full-year residence, 2026 federal and state brackets, standard deductions and employee payroll taxes. Local taxes, special deductions, state phaseouts, benefits and dependent credits are excluded. <a href={forecastSources.federal}>IRS</a> · <a href={forecastSources.payroll}>Social Security</a> · <a href={forecastSources.stateTax}>State brackets</a></p>
        : <p>Income uses the monthly take-home amounts you supplied. Include any payroll-deducted healthcare only once when editing living costs.</p>}
      {f.payMode === "gross" && [f.origin, f.destination].includes("AL") && <p>Alabama includes the deduction for federal income tax and the income-based standard deduction. <a href={forecastSources.alabama}>Alabama Department of Revenue</a></p>}
      <p>{typeof f.moving === "number" ? "Moving costs start with your amount." : guide
        ? "The moving allowance uses the midpoint of a published household shipping range. Your addresses, travel and extra fees can change it."
        : "This route needs your shipping quote. You can still compare monthly balances."} {guide && <a href={guide.source}>Moving cost guide</a>}</p>
      <p>Year one assumes 12 months after the move. Its salary target uses the midpoint of the one-time costs. Editing a budget amount updates the comparison.</p>
    </details>
  </section>;
}
