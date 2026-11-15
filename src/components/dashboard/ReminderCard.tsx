"use client";

import { Bell, BellOff, Check, LoaderCircle, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReminderStatus } from "@/app/api/reminders/route";
import { formatDay, LEAD_DAYS, upcomingReminders } from "@/lib/reminders";
import type { Task } from "@/lib/types";

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Deadline reminders by email. The list shows exactly which deadlines will be emailed and when,
 * all from the plan's dates. The address is confirmed by a link in an email before anything else is
 * sent, it is kept apart from the plan, and every email carries an unsubscribe link.
 */
export function ReminderCard({ sid, tasks, demo = false }: { sid: string | undefined; tasks: readonly Task[]; demo?: boolean }) {
  const [info, setInfo] = useState<ReminderStatus | null>(null);
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const upcoming = useMemo(() => {
    const done = tasks.filter((t) => "displayStatus" in t && (t as { displayStatus?: string }).displayStatus === "done").map((t) => t.id);
    return upcomingReminders(tasks, done, new Date().toISOString().slice(0, 10));
  }, [tasks]);

  useEffect(() => {
    if (!sid) return;
    let alive = true;
    fetch(`/api/reminders?sid=${sid}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<ReminderStatus>)
      .then((s) => alive && setInfo(s))
      .catch(() => alive && setInfo({ mode: "off", status: "none" }));
    return () => {
      alive = false;
    };
  }, [sid]);

  const turnOn = async () => {
    if (!sid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, email, consent: agreed }),
      });
      const body = (await response.json()) as ReminderStatus & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "That didn't go through.");
      setInfo(body);
      setChanging(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!sid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reminders/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid }),
      });
      if (!response.ok) throw new Error();
      setInfo((current) => (current ? { mode: current.mode, status: "none" } : null));
      setEmail("");
      setAgreed(false);
    } catch {
      setError("That didn't go through. Use the unsubscribe link in any reminder email.");
    } finally {
      setBusy(false);
    }
  };

  const showForm = info && (info.status === "none" || changing) && info.mode !== "off";

  return (
    <section aria-labelledby="reminders-title" className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-line">
      <h2 id="reminders-title" className="flex items-center gap-2.5 text-[0.9375rem] font-medium">
        <Bell className="size-4" strokeWidth={1.75} aria-hidden="true" /> Deadline reminders by email
      </h2>

      {upcoming.length > 0 ? (
        <ul className="mt-3 grid gap-2.5 text-sm">
          {upcoming.map((item) => (
            <li key={item.taskId}>
              <p className="font-medium">{item.title}</p>
              <p className="text-ink-muted">
                Due {formatDay(item.dueDate)}
                {item.remindOn.length > 0 && <> · email on {item.remindOn.map(short).join(", ")}</>}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">Add your move date to see which deadlines Civio will remind you about.</p>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        We email {LEAD_DAYS.join(", ")} days before each deadline, once each, and skip anything you mark done.
      </p>

      {demo || !sid ? (
        <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-sm text-ink-muted">Create your own plan to get these by email.</p>
      ) : !info ? (
        <div className="skeleton mt-3 h-10 w-full" aria-label="Loading" />
      ) : info.mode === "off" ? (
        <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-sm text-ink-muted">Email is not set up on this server yet.</p>
      ) : info.status === "confirmed" && !changing ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Check className="size-4 text-ok" aria-hidden="true" /> On for {info.email}
          </span>
          <button type="button" onClick={() => void turnOff()} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-brand-ink underline-offset-4 hover:underline">
            <BellOff className="size-3.5" aria-hidden="true" /> Turn off
          </button>
        </div>
      ) : info.status === "pending" && !changing ? (
        <div className="mt-3 text-sm">
          <p className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Check your inbox. We sent a confirmation to <strong>{info.email}</strong>. Reminders start after you confirm.
            </span>
          </p>
          {info.devConfirmUrl && (
            <p className="mt-2 text-xs text-ink-muted">
              Development mode, nothing was emailed:{" "}
              <a href={info.devConfirmUrl} className="font-semibold text-brand-ink underline underline-offset-4">
                open the confirmation link
              </a>
              .
            </p>
          )}
          <button type="button" onClick={() => setChanging(true)} className="mt-2 font-semibold text-brand-ink underline-offset-4 hover:underline">
            Use a different address
          </button>
        </div>
      ) : null}

      {showForm && (
        <form
          className="mt-3 grid gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void turnOn();
          }}
        >
          <label className="block">
            <span className="sr-only">Email address</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl bg-panel px-3 text-[0.9375rem] ring-1 ring-line placeholder:text-ink-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            />
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
            <span>Email me about these deadlines. I can unsubscribe from any email. My address is used for reminders only.</span>
          </label>
          <button type="submit" disabled={busy || !agreed || email.trim() === ""} className="btn btn-primary justify-self-start">
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
            {busy ? "Sending…" : "Turn on reminders"}
          </button>
          {info?.mode === "outbox" && (
            <p className="text-xs text-ink-muted">Development mode: the confirmation is written to a local file instead of being sent.</p>
          )}
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-risk">
          {error}
        </p>
      )}
    </section>
  );
}
