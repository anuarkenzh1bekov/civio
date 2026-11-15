import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { MoveBudget } from "./budget";
import { apiUrl, usePlan } from "@/lib/api";
import { DEMO_DONE, DEMO_PROFILE } from "@/lib/demo";
import type { Profile, Task, TaskStatus } from "@/lib/types";

const KEY = "civio:v1";

export type Saved = {
  /** Anonymous session id. Created with the first write; there is no login. */
  sid?: string;
  profile: Profile;
  done: string[];
  demo: boolean;
  /** Amounts the user typed into the cost calculator, by cost field id. */
  costs: Record<string, number>;
  /** Move Pack unlocked (demo checkout). */
  pack: boolean;
};

const EMPTY: Saved = { profile: {}, done: [], demo: false, costs: {}, pack: false };

let cache: { raw: string | null; value: Saved } | undefined;
const listeners = new Set<() => void>();

function normalize(parsed: Partial<Saved>): Saved {
  return {
    sid: typeof parsed.sid === "string" ? parsed.sid : undefined,
    profile: parsed.profile ?? {},
    done: Array.isArray(parsed.done) ? parsed.done : [],
    demo: parsed.demo === true,
    costs: parsed.costs && typeof parsed.costs === "object" ? parsed.costs : {},
    pack: parsed.pack === true,
  };
}

function read(): Saved {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    if (cache) return cache.value;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  if (raw) {
    try {
      value = normalize(JSON.parse(raw) as Partial<Saved>);
    } catch {
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

// ── Server copy ──
// The browser copy is the one the app reads. Every change is also pushed to
// the server under the session id, so the "continue on another device" link
// has something to load. A failed push is retried on the next change.

let pushTimer: ReturnType<typeof setTimeout> | undefined;

function push(saved: Saved) {
  if (!saved.sid) return;
  const { sid, ...session } = saved;
  fetch(apiUrl(`/api/session/${sid}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
    keepalive: true,
  }).catch(() => {
    // Offline or the server is down: the local copy still works.
  });
}

function write(next: Saved, sync = true) {
  // An empty state has nothing worth a session yet.
  const hasContent = Object.keys(next.profile).length > 0;
  const value: Saved = hasContent && !next.sid ? { ...next, sid: crypto.randomUUID() } : next;
  const raw = JSON.stringify(value);
  cache = { raw, value };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Use the readable storage snapshot (including null) as the cache key
    // if writes are unavailable, so the next render retains the plan.
    let existing: string | null = null;
    try { existing = window.localStorage.getItem(KEY); } catch { /* Storage is blocked. */ }
    cache = { raw: existing, value };
  }
  listeners.forEach((fn) => fn());
  if (sync && value.sid) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(value), 500);
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

/** Load a session by id (from a continue link) and make it this browser's session. */
export async function adoptSession(sid: string): Promise<boolean> {
  try {
    const response = await fetch(apiUrl(`/api/session/${sid}`), { cache: "no-store" });
    if (!response.ok) return false;
    const body = (await response.json()) as { session: Partial<Saved> };
    write({ ...normalize(body.session), sid }, false);
    return true;
  } catch {
    return false;
  }
}

export type PlanTask = Task & {
  displayStatus: TaskStatus;
  /** Titles of unfinished tasks this one waits on. */
  waitingOn: string[];
};

/**
 * `preview` runs the Texas to California sample in memory only: nothing is read from or
 * written to the browser's saved plan, so looking at the demo never overwrites a real one.
 */
export function useCivio(preview = false) {
  // `null` on the server and during hydration, so nothing renders from stale markup.
  const personal = useSyncExternalStore<Saved | null>(subscribe, read, () => null);
  const [sample, setSample] = useState<Saved>({ ...EMPTY, profile: DEMO_PROFILE, done: DEMO_DONE, demo: true });
  const saved = preview ? sample : personal;
  const update = useCallback(
    (modify: (current: Saved) => Saved) => {
      if (preview) setSample(modify);
      else write(modify(read()));
    },
    [preview],
  );

  // The checklist comes from the rule engine on the server; what is ticked off is layered on here.
  const plan = usePlan(saved?.profile);
  const tasks: PlanTask[] = useMemo(() => {
    if (!saved) return [];
    const done = new Set(saved.done);
    const titles = new Map(plan.tasks.map((task) => [task.id, task.title]));
    return plan.tasks.map((task) => ({
      ...task,
      displayStatus: done.has(task.id) ? "done" : task.status,
      waitingOn: task.dependsOn.filter((id) => !done.has(id)).map((id) => titles.get(id) ?? id),
    }));
  }, [saved, plan.tasks]);

  const saveProfile = useCallback((profile: Profile) => {
    write({ ...read(), profile, demo: false });
  }, []);

  const toggleDone = useCallback(
    (taskId: string) => {
      update((current) => {
        const done = current.done.includes(taskId)
          ? current.done.filter((id) => id !== taskId)
          : [...current.done, taskId];
        return { ...current, done };
      });
    },
    [update],
  );

  const setConsent = useCallback(
    (aiConsent: boolean) => update((current) => ({ ...current, profile: { ...current.profile, aiConsent } })),
    [update],
  );

  const saveBudget = useCallback(
    (budget: MoveBudget) => update((current) => ({ ...current, profile: { ...current.profile, budget } })),
    [update],
  );

  const setArrived = useCallback(
    (arrivedOn: string | undefined) => update((current) => ({ ...current, profile: { ...current.profile, arrivedOn } })),
    [update],
  );

  const setCost = useCallback(
    (id: string, amount: number | null) =>
      update((current) => {
        const costs = { ...current.costs };
        if (amount === null) delete costs[id];
        else costs[id] = amount;
        return { ...current, costs };
      }),
    [update],
  );

  const setPack = useCallback((pack: boolean) => update((current) => ({ ...current, pack })), [update]);

  const loadDemo = useCallback(() => {
    write({ ...EMPTY, profile: DEMO_PROFILE, done: DEMO_DONE, demo: true });
  }, []);

  const reset = useCallback(() => write(EMPTY), []);

  return {
    ready: saved !== null && plan.ready,
    /** The server could not be reached, so there is no checklist to show. */
    planFailed: plan.failed,
    sid: preview ? undefined : saved?.sid,
    profile: saved?.profile ?? {},
    isDemo: saved?.demo ?? false,
    hasPlan: Boolean(saved?.profile.currentState && saved.profile.destinationState),
    costs: saved?.costs ?? EMPTY.costs,
    pack: saved?.pack ?? false,
    tasks,
    saveProfile,
    toggleDone,
    setConsent,
    saveBudget,
    setArrived,
    setCost,
    setPack,
    loadDemo,
    reset,
  };
}
