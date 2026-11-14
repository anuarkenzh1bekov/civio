import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { isStateCode, stateName } from "@/lib/states";
import type { Profile } from "@/lib/types";

function StatePhoto({ code, side }: { code?: string; side: "from" | "to" }) {
  if (!code || !isStateCode(code)) return null;
  return (
    <div
      className={`route-photo route-photo-${side}`}
      aria-hidden="true"
      style={{ backgroundImage: `url("/states/${code.toLowerCase()}.webp")` }}
    />
  );
}

export function RouteBanner({ profile, sample }: { profile: Profile; sample: boolean }) {
  const origin = stateName(profile.currentState);
  const destination = stateName(profile.destinationState);
  const hasLongWord = [...origin.split(" "), ...destination.split(" ")].some(word => word.length >= 11);

  return (
    <section id="overview" className="ledger-route" aria-labelledby="plan-route-title">
      <StatePhoto code={profile.currentState} side="from" />
      <StatePhoto code={profile.destinationState} side="to" />
      <p className="route-meta">
        {sample ? "Sample moving budget" : "Your moving budget"}
        {profile.moveDate && <> · {formatDate(profile.moveDate)}</>}
      </p>
      <h1 id="plan-route-title" className={hasLongWord ? "route-title-compact" : undefined}>
        <span>{origin}</span>
        <ArrowRight aria-hidden="true" />
        <span className="sr-only"> to </span>
        <span>{destination}</span>
      </h1>
    </section>
  );
}
