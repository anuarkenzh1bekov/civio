import { useEffect, useRef, useState } from "react";
import type { Profile, Task } from "@/lib/types";

/** Where the FastAPI backend lives. Empty in development: Vite proxies /api to it. */
const BASE: string = import.meta.env.VITE_API_URL ?? "";
export const apiUrl = (path: string) => BASE + path;

// ── Response shapes of the backend ──

export type IntakeResult = {
  /** Only the fields that were found. */
  profile: Partial<Profile>;
  /** One short line per field: what was read and from which words. */
  found: { field: keyof Profile; label: string; value: string; from: string }[];
};
export type IntakeResponse = IntakeResult & { mode: "ai" | "rules_only"; notice?: string };
export type ChatIntakeResponse = IntakeResponse & { declined: import("@/lib/intake/flow").FlowField[] };
export type DocumentResponse = { letter: string; mode: "ai" | "template"; notice?: string };
export type RuleSource = { ruleId: string; name: string; url: string; lastVerified: string };

// ── Cached reads ──
// The plan depends only on the profile, so one answer is kept per request and
// shared by every page; moving between pages does not ask the server again.

const settled = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();

function load(key: string, path: string, body: unknown): Promise<unknown> {
  let request = pending.get(key);
  if (!request) {
    request = fetch(apiUrl(path), body === undefined ? undefined : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    }).then((data) => {
      settled.set(key, data);
      return data;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

/**
 * Data from the backend: a POST with `body`, or a GET when there is none.
 * `null` skips the request. While a new answer loads, the previous one stays
 * on screen, so editing a profile does not blank the page.
 */
export function useApi<T>(path: string, body?: unknown): { data: T | undefined; failed: boolean } {
  const key = body === null ? null : `${path}\n${JSON.stringify(body)}`;
  const [outcome, setOutcome] = useState<{ key: string; failed: boolean } | null>(null);
  const shown = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (key === null || settled.has(key)) return;
    let live = true;
    load(key, path, body).then(
      () => { if (live) setOutcome({ key, failed: false }); },
      () => { if (live) setOutcome({ key, failed: true }); },
    );
    return () => { live = false; };
    // `key` stands for path and body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { data: undefined, failed: false };
  if (settled.has(key)) shown.current = settled.get(key) as T;
  return { data: shown.current, failed: outcome?.key === key && outcome.failed };
}

/** The answers the rule engine reads. Budget edits and letter fields are not among them. */
const RULE_FIELDS = [
  "currentState", "destinationState", "moveDate", "arrivedOn", "employment", "income",
  "hasChildren", "childAges", "insurance", "hasVehicle", "drives",
] as const satisfies readonly (keyof Profile)[];

function ruleProfile(profile: Profile): { profile: Partial<Profile> } {
  const entries = RULE_FIELDS.map((key) => [key, profile[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null && value !== "");
  return { profile: Object.fromEntries(entries) };
}

const NO_TASKS: Task[] = [];

const moves = (profile: Profile | null | undefined): profile is Profile =>
  Boolean(profile?.currentState && profile.destinationState);

/** The checklist for a profile, from the rule engine. Empty until both states are known. */
export function usePlan(profile: Profile | null | undefined): { tasks: Task[]; ready: boolean; failed: boolean } {
  const { data, failed } = useApi<{ tasks: Task[] }>("/api/plan", moves(profile) ? ruleProfile(profile) : null);
  return { tasks: (moves(profile) && data?.tasks) || NO_TASKS, ready: !moves(profile) || data !== undefined || failed, failed };
}

export type NotifyList<Item> = { items: Item[]; text: string };

/** Who to tell about the move, as a list and as plain text for copying. */
export function useNotifyList<Item>(profile: Profile): NotifyList<Item> {
  const { data } = useApi<NotifyList<Item>>("/api/documents/notify", moves(profile) ? ruleProfile(profile) : null);
  return data ?? { items: [], text: "" };
}

/** Official sources behind the given rules. */
export function useRuleSources(ids: readonly string[]): RuleSource[] {
  return useApi<{ sources: RuleSource[] }>(`/api/rules/sources?ids=${ids.join(",")}`).data?.sources ?? [];
}
