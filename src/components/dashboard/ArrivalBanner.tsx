"use client";

import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { checkArrival, stateFromCoords, type StateGuess } from "@/lib/geo";
import { isStateCode, stateName } from "@/lib/states";
import type { Profile } from "@/lib/types";

const ASKED = "civio:location-asked";

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type State =
  | { kind: "idle" }
  | { kind: "arrived"; guess: StateGuess; simulated: boolean }
  | { kind: "not_there"; where: string }
  | { kind: "unavailable" };

/**
 * Location is checked when the dashboard opens, once per browser session, and
 * again only when the user asks. A web page cannot follow location in the
 * background and this one does not try. The coordinates are turned into a
 * state in the browser and are never sent or stored.
 *
 * `/dashboard?loc=CA` stands in for the browser's answer, for demos.
 */
export function ArrivalBanner({
  profile,
  onArrived,
  onUndo,
}: {
  profile: Profile;
  onArrived: (date: string) => void;
  onUndo: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const { currentState, destinationState, arrivedOn } = profile;

  const apply = (guess: StateGuess | null, simulated: boolean, asked: boolean) => {
    if (!guess) return setState(asked ? { kind: "not_there", where: "outside the US states Civio knows" } : { kind: "idle" });
    const check = checkArrival(guess, currentState, destinationState);
    if (check === "arrived") setState({ kind: "arrived", guess, simulated });
    else setState(asked ? { kind: "not_there", where: stateName(guess.best) } : { kind: "idle" });
  };

  const locate = (asked: boolean) => {
    if (!("geolocation" in navigator)) return setState(asked ? { kind: "unavailable" } : { kind: "idle" });
    navigator.geolocation.getCurrentPosition(
      (position) => apply(stateFromCoords(position.coords.latitude, position.coords.longitude), false, asked),
      () => setState(asked ? { kind: "unavailable" } : { kind: "idle" }),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };

  useEffect(() => {
    if (arrivedOn || !destinationState) return;
    const simulated = new URLSearchParams(window.location.search).get("loc")?.toUpperCase();
    if (simulated && isStateCode(simulated)) {
      apply({ best: simulated, candidates: [simulated] }, true, true);
      return;
    }
    try {
      if (window.sessionStorage.getItem(ASKED)) return;
      window.sessionStorage.setItem(ASKED, "1");
    } catch {
      // Without session storage, ask on each open.
    }
    locate(false);
    // Runs once per open; the profile's states are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivedOn, destinationState]);

  if (!destinationState) return null;
  const destination = stateName(destinationState);

  if (arrivedOn) {
    return (
      <div className="tile mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-moss-wash text-moss">
          <MapPin className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">You arrived in {destination} on {formatDate(arrivedOn)}.</span>{" "}
          <span className="text-muted">Deadlines now count from that date.</span>
        </p>
        <button type="button" onClick={onUndo} className="btn btn-quiet">
          Undo
        </button>
      </div>
    );
  }

  if (state.kind === "arrived" && !dismissed) {
    const nearBorder = state.guess.candidates.length > 1;
    return (
      <div className="iris relative mt-6 overflow-hidden rounded-panel p-5 shadow-soft" role="status">
        <span className="absolute inset-0 bg-white/45" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/80">
            <MapPin className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold tracking-tight">
              {nearBorder ? `It looks like you are in ${destination}.` : `You are already in ${destination}.`}
            </p>
            <p className="mt-0.5 text-sm">
              Confirm and Civio switches to your arrival checklist: deadlines count from today instead of your planned date.
              {state.simulated ? " (Simulated location.)" : " Checked just now, when you opened this page."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onArrived(localToday())} className="btn btn-ink">
              Yes, I've arrived
            </button>
            <button type="button" onClick={() => setDismissed(true)} className="btn btn-quiet">
              Not yet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <button
        type="button"
        onClick={() => {
          setDismissed(false);
          locate(true);
        }}
        className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-ink underline-offset-4 hover:underline"
      >
        <LocateFixed className="size-4" aria-hidden="true" /> Already in {destination}? Check my location
      </button>
      <span aria-live="polite">
        {state.kind === "not_there" && `Your browser places you in ${state.where}, so the plan stays on your planned date.`}
        {state.kind === "unavailable" && "Your browser did not share a location. Nothing changes."}
        {state.kind === "idle" && "Checked when you open this page, never in the background. Coordinates stay in your browser."}
      </span>
    </p>
  );
}
