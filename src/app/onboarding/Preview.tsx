import { compareBudget, dollars, type MoveBudget } from "@/lib/budget";
import { money, splitAreas, type Answers } from "@/lib/forecast/conversation";
import { forecastSources, priceChange, rentFor } from "@/lib/forecast/model";
import { stateName } from "@/lib/states";
import styles from "./planner.module.css";

export function marketNote(a: Answers) {
  if (!a.origin || !a.destination) return "";
  const change = priceChange(a.origin, a.destination);
  return Math.abs(change) < .05 ? "Overall prices in these states are about the same."
    : `Overall prices in ${stateName(a.destination)} are about ${Math.abs(change).toFixed(1)}% ${change < 0 ? "lower" : "higher"} than in ${stateName(a.origin)}.`;
}

export function Preview({ a, budget }: { a: Answers; budget: MoveBudget | null }) {
  const ready = Boolean(a.origin && a.destination);
  const areas = splitAreas(a.areas);
  const bedrooms = a.bedrooms ?? 1;
  const from = a.origin ? rentFor(a.origin, bedrooms, areas.originMetro) : null;
  const to = a.destination ? rentFor(a.destination, bedrooms, areas.destinationMetro) : null;
  const balances = budget ? compareBudget(budget) : null;
  const change = ready ? priceChange(a.origin!, a.destination!) : 0;
  return <aside className={styles.preview} aria-label="Your comparison">
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.fromPhoto} style={{ backgroundImage: `url(/states/${(a.origin ?? "AK").toLowerCase()}.webp)` }} />
      {a.destination && <div className={styles.toPhoto} style={{ backgroundImage: `url(/states/${a.destination.toLowerCase()}.webp)` }} />}
      <div className={styles.photoShade} />
      <span>{a.origin ? a.origin + (a.destination ? "  →  " + a.destination : "") : "Alaska"}</span>
    </div>
    <div className={styles.previewBody}>
      <h2>{ready ? "Your comparison" : "Your move"}</h2>
      {!ready ? <p>Choose your two states to see how prices and housing compare.</p> : <>
        <p>{stateName(a.origin)} → {stateName(a.destination)}</p>
        <dl className={styles.figures}>
          {balances?.now != null && balances.after != null && <div><dt>Left per month · stay → move</dt><dd>{dollars(balances.now)} → {dollars(balances.after)}</dd></div>}
          <div><dt>Overall price level</dt><dd>{Math.abs(change) < .05 ? "About the same" : Math.abs(change).toFixed(1) + "% " + (change < 0 ? "lower" : "higher")}</dd></div>
          <div><dt>{bedrooms === 0 ? "Studio" : `${bedrooms}-bedroom`} median rent</dt><dd>{money(from!.rent)} → {money(to!.rent)}</dd></div>
        </dl>
        <small>{from?.area ?? stateName(a.origin)} and {to?.area ?? stateName(a.destination)} · Monthly gross rent</small>
        <div className={styles.sources}><a href={forecastSources.rent}>US Census</a><a href={forecastSources.prices}>BEA prices</a></div>
      </>}
    </div>
  </aside>;
}
