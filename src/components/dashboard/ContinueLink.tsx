"use client";

import { Check, Smartphone } from "lucide-react";
import { useState } from "react";

/**
 * "Continue on another device". The link carries the anonymous session id,
 * and anyone who has it can open and change the plan, so the text says so.
 */
export function ContinueLink({ sid }: { sid: string | undefined }) {
  const [state, setState] = useState<"idle" | "copied" | "shown">("idle");
  if (!sid) return null;
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/dashboard?s=${sid}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      // Clipboard can be blocked; show the link so it can be copied by hand.
      setState("shown");
    }
  };

  return (
    <div className="rounded-2xl bg-card p-3 shadow-soft ring-1 ring-line">
      <button type="button" onClick={copy} className="flex min-h-10 w-full items-center gap-2.5 text-left text-[0.9375rem] font-medium">
        {state === "copied" ? (
          <Check className="size-4 text-ok" aria-hidden="true" />
        ) : (
          <Smartphone className="size-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        <span aria-live="polite">{state === "copied" ? "Link copied" : "Continue on another device"}</span>
      </button>
      {state === "shown" && (
        <input
          readOnly
          value={url}
          aria-label="Link to this plan"
          onFocus={(e) => e.target.select()}
          className="mt-1 w-full rounded-lg bg-panel px-2 py-1.5 font-mono text-xs"
        />
      )}
      <p className="mt-1 text-xs text-ink-muted">No account. Anyone with the link can open and edit this plan.</p>
    </div>
  );
}
