import { ArrowRight } from "lucide-react";
import { RoutePhotos } from "@/components/RoutePhotos";
import { formatDate } from "@/lib/format";
import { stateName } from "@/lib/states";
import type { Profile } from "@/lib/types";

export function RouteBanner({ profile, sample }: { profile: Profile; sample: boolean }) {
  const origin = stateName(profile.currentState);
  const destination = stateName(profile.destinationState);
  const hasLongWord = [...origin.split(" "), ...destination.split(" ")].some(word => word.length >= 11);

  return (
    <section id="overview" className="ledger-route" aria-labelledby="plan-route-title">
      <RoutePhotos origin={profile.currentState} destination={profile.destinationState}
        sizes="(max-width: 1023px) 100vw, (max-width: 1360px) 75vw, 1068px" />
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
