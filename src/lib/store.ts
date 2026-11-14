"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { MoveBudget } from "./budget";
import { DEMO_DONE, DEMO_PROFILE } from "@/lib/demo";
import { RULES } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";
import type { Profile, Task, TaskStatus } from "@/lib/types";

const KEY = "civio:v1";

export type Saved = { profile: Profile; done: string[]; demo: boolean };

const EMPTY: Saved = { profile: {}, done: [], demo: false };

let cache: { raw: string | null; value: Saved } | undefined;
const listeners = new Set<() => void>();

function read(): Saved {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage can be blocked (private mode). The app then works for the session only.
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      value = {
        profile: parsed.profile ?? {},
        done: Array.isArray(parsed.done) ? parsed.done : [],
        demo: parsed.demo === true,
      };
    } catch {
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

function write(next: Saved) {
  const raw = JSON.stringify(next);
  cache = { raw, value: next };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Keep the in-memory copy.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

export type PlanTask = Task & { displayStatus: TaskStatus };

export function useCivio(preview = false) {
  // `null` on the server and during hydration, so nothing renders from stale markup.
  const personal = useSyncExternalStore<Saved | null>(subscribe, read, () => null);
  const [sample, setSample] = useState<Saved>({ profile: DEMO_PROFILE, done: DEMO_DONE, demo: true });
  const saved = preview ? sample : personal;
  const update = useCallback((modify: (current: Saved) => Saved) => {
    if (preview) setSample(modify);
    else write(modify(read()));
  }, [preview]);

  const tasks: PlanTask[] = useMemo(() => {
    if (!saved) return [];
    const done = new Set(saved.done);
    return generatePlan(saved.profile, RULES).map((task) => ({
      ...task,
      displayStatus: done.has(task.id) ? "done" : task.status,
    }));
  }, [saved]);

  const saveProfile = useCallback((profile: Profile) => {
    write({ ...read(), profile, demo: false });
  }, []);

  const toggleDone = useCallback((taskId: string) => {
    update(current => {
      const done = current.done.includes(taskId)
        ? current.done.filter((id) => id !== taskId)
        : [...current.done, taskId];
      return { ...current, done };
    });
  }, [update]);

  const setConsent = useCallback((aiConsent: boolean) => {
    update(current => ({ ...current, profile: { ...current.profile, aiConsent } }));
  }, [update]);

  const saveBudget = useCallback((budget: MoveBudget) => {
    update(current => ({ ...current, profile: { ...current.profile, budget } }));
  }, [update]);

  const reset = useCallback(() => write(EMPTY), []);

  return {
    ready: saved !== null,
    profile: saved?.profile ?? {},
    isDemo: saved?.demo ?? false,
    hasPlan: Boolean(saved?.profile.currentState && saved.profile.destinationState),
    tasks,
    saveProfile,
    toggleDone,
    setConsent,
    saveBudget,
    reset,
  };
}
