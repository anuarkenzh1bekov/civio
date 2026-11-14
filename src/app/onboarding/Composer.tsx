import { ArrowRight, ArrowUp } from "lucide-react";
import { useState } from "react";
import { money, options, question, splitAreas, type Answers, type Step } from "@/lib/forecast/conversation";
import { areasIn, movingGuide } from "@/lib/forecast/model";
import { stateName, US_STATES } from "@/lib/states";
import styles from "./planner.module.css";

function areaOptions(code: string, name: string, value: string, onChange: (id: string) => void) {
  return <label className={styles.field}><span>{name} · {stateName(code)}</span>
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">State median</option>
      {areasIn(code).map(area => <option value={area.id} key={area.id}>{area.name}</option>)}
    </select></label>;
}

export function Composer({ step, answers: a, onReply, editing, cancel }: {
  step: Step; answers: Answers; onReply: (input: string) => string | undefined; editing: boolean; cancel: () => void;
}) {
  const value = a[step];
  const inputValue = value !== undefined && value !== null && ["pay", "moving", "offer", "date", "children"].includes(step)
    && !["estimate", "skip", "none", "yes"].includes(String(value)) ? String(value) : "";
  const [input, setInput] = useState(inputValue);
  const [error, setError] = useState("");
  const existing = splitAreas(a.areas);
  const [originMetro, setOriginMetro] = useState(existing.originMetro ?? "");
  const [destinationMetro, setDestinationMetro] = useState(existing.destinationMetro ?? "");
  const stateStep = step === "origin" || step === "destination";
  const entry = stateStep || ["pay", "offer", "moving", "children", "date"].includes(step);
  const suggested = options(step, a);
  const submit = (answer: string) => setError(onReply(answer) ?? "");
  const placeholders: Partial<Record<Step, string>> = {
    origin: "Type a state or a route…", destination: "State name or abbreviation…",
    pay: a.payMode === "gross" ? "Annual salary, e.g. 85k" : "Monthly take-home, e.g. 5,200",
    offer: a.payMode === "gross" ? "Annual salary offer…" : "New monthly take-home…",
    moving: "Your one-time cost…", children: "Ages, e.g. 4, 10",
  };
  const hints: Partial<Record<Step, string>> = {
    areas: "A metro area gives a more local rent estimate. You can use either state median.",
    payMode: "Use household take-home for multiple earners, self-employment or other filing situations.",
    bedrooms: "I’ll use the same home size on both sides. You can edit either rent later.",
    filing: "This estimate covers one wage earner. For other filing situations, choose monthly take-home.",
    offer: a.payMode === "net" ? "Enter the amount after taxes and payroll deductions." : "Enter annual base pay before taxes.",
  };
  if (step === "moving") {
    const guide = movingGuide(a.origin!, a.destination!, a.bedrooms!);
    hints.moving = guide ? `A household shipment this size has a planning range of ${money(guide.range[0])}–${money(guide.range[1])}. A quote will narrow it down.`
      : "This route needs a shipping quote. You can compare monthly savings now and add the cost later.";
  }
  return <div className={styles.composer}>
    {hints[step] && <p className={styles.hint}>{hints[step]}</p>}
    <form onSubmit={e => { e.preventDefault(); submit(step === "areas" ? [originMetro, destinationMetro].join("|") : input); }}>
      {step === "areas" && <div className={styles.areaFields}>
        {areaOptions(a.origin!, "From", originMetro, setOriginMetro)}
        {areaOptions(a.destination!, "To", destinationMetro, setDestinationMetro)}
      </div>}
      {entry && <div className={styles.entry}>
        <input aria-label={question(step, a)} aria-invalid={Boolean(error)} aria-describedby={error ? "planner-error" : undefined}
          autoComplete="off" type={step === "date" ? "date" : "text"} list={stateStep ? "planner-states" : undefined}
          value={input} placeholder={placeholders[step]} maxLength={90} onChange={e => { setInput(e.target.value); setError(""); }} />
        <button type="submit" disabled={!input.trim()} aria-label="Send answer"><ArrowUp size={18} /></button>
        {stateStep && <datalist id="planner-states">{US_STATES.filter(s => step !== "destination" || s.code !== a.origin)
          .map(s => <option key={s.code} value={s.name}>{s.code}</option>)}</datalist>}
      </div>}
      {step === "areas" && <button className={styles.solid} type="submit">Use these areas <ArrowRight size={16} /></button>}
    </form>
    {suggested.length > 0 && <div className={styles.choices} aria-label="Suggested answers">{suggested.map(o =>
      <button type="button" key={o.value} onClick={() => submit(o.value)}>{o.label}</button>)}</div>}
    {error && <p id="planner-error" role="alert" className={styles.error}>{error}</p>}
    {editing && <button type="button" className={styles.under} onClick={cancel}>Cancel edit</button>}
  </div>;
}
