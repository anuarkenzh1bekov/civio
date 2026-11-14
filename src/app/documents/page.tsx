"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, Download, LoaderCircle, Lock, Printer, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { DocumentResponse } from "@/app/api/documents/route";
import { Logo } from "@/components/Logo";
import {
  availableLetters,
  buildLetter,
  buildNotifyList,
  EMPTY_FIELDS,
  LETTERS,
  notifyListText,
  type LetterFields,
  type LetterKind,
} from "@/lib/documents";
import { stateName } from "@/lib/states";
import { useCivio } from "@/lib/store";
import type { Profile } from "@/lib/types";

const FIELDS_KEY = "civio:letter-fields";

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Names and addresses stay in this browser only: they are not part of the synced session. */
function loadFields(): LetterFields {
  try {
    const raw = window.localStorage.getItem(FIELDS_KEY);
    if (raw) return { ...EMPTY_FIELDS, ...(JSON.parse(raw) as Partial<LetterFields>) };
  } catch {
    // Fall through to empty fields.
  }
  return EMPTY_FIELDS;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the text is on screen and can be selected by hand.
        }
      }}
    >
      {copied ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        maxLength={200}
        className="mt-1.5 h-11 w-full rounded-xl bg-panel px-3 text-[0.9375rem] ring-1 ring-line placeholder:text-ink-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      />
    </label>
  );
}

function Letters({ unlocked, onUnlock, profile }: { unlocked: boolean; onUnlock: () => void; profile: Profile }) {
  const kinds = useMemo(() => availableLetters(profile), [profile]);
  const [kind, setKind] = useState<LetterKind>("address_change");
  const [fields, setFieldsState] = useState<LetterFields>(loadFields);
  const [instructions, setInstructions] = useState("");
  // An AI or hand-edited version, kept per template and only while its inputs are unchanged.
  const [custom, setCustom] = useState<{ key: string; text: string; mode: "ai" | "edited" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const setField = (patch: Partial<LetterFields>) => {
    const next = { ...fields, ...patch };
    setFieldsState(next);
    try {
      window.localStorage.setItem(FIELDS_KEY, JSON.stringify(next));
    } catch {
      // Kept for this visit only.
    }
  };

  const active = kinds.includes(kind) ? kind : "address_change";
  const template = useMemo(() => buildLetter(active, fields, profile, today()), [active, fields, profile]);
  const key = `${active}\n${template}`;
  const text = custom?.key === key ? custom.text : template;
  const meta = LETTERS[active];
  const missing = /\[[^\]]+\]/.test(text);

  const tailor = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letter: text, instructions }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as DocumentResponse;
      if (result.mode === "ai") setCustom({ key, text: result.letter, mode: "ai" });
      setNotice(result.notice ?? null);
    } catch {
      setNotice("That didn't go through. The standard letter is unchanged.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="letters-title" className="tile overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-6 pb-0">
        <div>
          <p className="mono-label text-ink-muted">Move Pack</p>
          <h2 id="letters-title" className="mt-1 text-xl font-semibold tracking-tight">
            Letters ready to send
          </h2>
        </div>
        {unlocked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-brand-ink">
            <Check className="size-3.5" aria-hidden="true" /> Unlocked
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 px-6 pt-4" role="tablist" aria-label="Letter">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active === k}
            onClick={() => {
              setKind(k);
              setNotice(null);
            }}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${
              active === k ? "bg-brand-soft text-brand-ink ring-1 ring-brand-tint" : "bg-panel text-ink-muted"
            }`}
          >
            {LETTERS[k].title}
          </button>
        ))}
      </div>
      <p className="px-6 pt-3 text-sm text-ink-muted">{meta.blurb}</p>

      {unlocked ? (
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid content-start gap-4">
            <Field label="Your full name" value={fields.fullName} onChange={(fullName) => setField({ fullName })} autoComplete="name" />
            <Field label="Old address" value={fields.oldAddress} onChange={(oldAddress) => setField({ oldAddress })} placeholder="Street, city, state, ZIP" />
            <Field label="New address" value={fields.newAddress} onChange={(newAddress) => setField({ newAddress })} placeholder="Street, city, state, ZIP" />
            <Field label="Recipient" value={fields.recipient} onChange={(recipient) => setField({ recipient })} placeholder={meta.recipientHint} />
            <Field label={`${meta.referenceLabel} (optional)`} value={fields.reference} onChange={(reference) => setField({ reference })} />
            <p className="text-xs text-ink-muted">
              Names and addresses stay in this browser. They are sent to the AI model only when you press “Tailor with AI”.
            </p>
          </div>

          <div>
            <label htmlFor="letter-text" className="sr-only">
              Letter text
            </label>
            <textarea
              id="letter-text"
              value={text}
              onChange={(e) => setCustom({ key, text: e.target.value, mode: "edited" })}
              rows={18}
              spellCheck
              className="letter-sheet w-full resize-y rounded-2xl bg-panel/60 p-5 font-mono text-[0.8125rem] leading-relaxed ring-1 ring-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            />
            {/* A textarea prints clipped, so the page prints this copy instead. */}
            <pre className="print-sheet" aria-hidden="true">
              {text}
            </pre>
            <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
              {custom?.key === key
                ? custom.mode === "ai"
                  ? "Rewritten by AI from your inputs. Read it before sending."
                  : "Edited by you."
                : "Standard template, filled from your profile."}
              {missing && " Text in [brackets] still needs your details."}
              {custom?.key === key && (
                <button type="button" onClick={() => setCustom(null)} className="ml-2 font-semibold text-ink underline underline-offset-4">
                  Back to the template
                </button>
              )}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-panel/60 p-3">
              <label className="min-w-0 flex-1 basis-56">
                <span className="text-sm font-medium">Anything to add or change?</span>
                <input
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  maxLength={600}
                  placeholder="e.g. mention that I pay rent through the 31st…"
                  className="mt-1.5 h-11 w-full rounded-xl bg-card px-3 text-[0.9375rem] ring-1 ring-line placeholder:text-ink-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                />
              </label>
              <button type="button" onClick={() => void tailor()} disabled={busy} className="btn btn-primary">
                {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                {busy ? "Writing…" : "Tailor with AI"}
              </button>
            </div>
            {notice && (
              <p role="status" className="mt-2 text-sm text-warn">
                {notice}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <CopyButton text={text} />
              <button type="button" className="btn btn-quiet" onClick={() => download(`${active.replace("_", "-")}.txt`, text)}>
                <Download className="size-4" aria-hidden="true" /> Download
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" /> Print
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative m-6 overflow-hidden rounded-2xl ring-1 ring-line">
          <pre aria-hidden="true" className="max-h-72 select-none overflow-hidden whitespace-pre-wrap bg-panel/60 p-5 font-mono text-[0.8125rem] leading-relaxed blur-[3px]">
            {template}
          </pre>
          <div className="absolute inset-0 grid place-items-center bg-card/70 p-5 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-ink text-white">
                <Lock className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-4 font-display text-2xl font-semibold tracking-tight">Move Pack · $19</p>
              <p className="mt-1 text-sm text-ink-muted">
                {kinds.length} letters filled from your profile, AI tailoring, and copy, download or print. One payment per move.
              </p>
              <button type="button" onClick={onUnlock} className="btn btn-primary mt-5">
                Unlock Move Pack <ArrowRight className="size-4" aria-hidden="true" />
              </button>
              <p className="mt-2 text-xs text-ink-muted">Demo checkout: no card is asked for and nothing is charged.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-panel" aria-busy="true" />}>
      <DocumentsRoute />
    </Suspense>
  );
}

function DocumentsRoute() {
  // ?demo=1 shows the sample plan in memory, the same as the dashboard does.
  const preview = useSearchParams().get("demo") === "1";
  return <Documents key={String(preview)} preview={preview} />;
}

function Documents({ preview }: { preview: boolean }) {
  const { ready, hasPlan, profile, tasks, pack, setPack } = useCivio(preview);
  const notify = useMemo(() => buildNotifyList(profile, tasks), [profile, tasks]);

  if (!ready) return <div className="min-h-dvh bg-panel" aria-busy="true" />;

  if (!hasPlan) {
    return (
      <div className="grid min-h-dvh place-items-center bg-panel px-5">
        <div className="tile max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Documents need a plan first</h1>
          <p className="mt-2 text-ink-muted">Tell Civio where you are moving and the list and letters are built from that.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/onboarding" className="btn btn-primary">
              Get Started <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/documents?demo=1" className="btn btn-quiet">
              Load the demo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-panel">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Logo />
          <Link href={preview ? "/dashboard?demo=1" : "/dashboard"} className="btn btn-quiet">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to the plan
          </Link>
        </div>

        <h1 className="mt-8 text-[clamp(1.75rem,3vw,2.375rem)] font-semibold leading-tight tracking-[-0.03em]">Documents</h1>
        <p className="mt-1 text-ink-muted">
          {stateName(profile.currentState)} to {stateName(profile.destinationState)}. Built from your answers, so nothing here
          applies to someone else's move.
        </p>

        <section aria-labelledby="notify-title" className="tile mt-6 overflow-hidden print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
            <div>
              <p className="mono-label text-ink-muted">Free</p>
              <h2 id="notify-title" className="mt-1 text-xl font-semibold tracking-tight">
                Who to notify
              </h2>
            </div>
            <CopyButton text={notifyListText(notify, profile)} label="Copy the list" />
          </div>
          <ol className="divide-y divide-line border-t border-line">
            {notify.map((item, index) => (
              <li key={item.id} className="grid gap-x-4 gap-y-1 px-6 py-4 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)]">
                <span className="font-mono text-xs tabular-nums text-ink-muted md:pt-1">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-semibold">{item.who}</p>
                  {item.link && (
                    <a
                      href={item.link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"
                    >
                      {item.link.name} <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <div className="text-sm">
                  <p>{item.why}</p>
                  <p className="mt-1 text-ink-muted">{item.how}</p>
                  {item.letter && <p className="mt-1 text-xs text-ink-muted">Letter in Move Pack: {LETTERS[item.letter].title}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-6">
          <Letters unlocked={pack} onUnlock={() => setPack(true)} profile={profile} />
        </div>

        <p className="mt-8 text-sm text-ink-muted print:hidden">
          These are general templates, not legal advice. Check your lease, policy or account terms for notice periods and
          required forms before you send anything.
        </p>
      </main>
    </div>
  );
}
