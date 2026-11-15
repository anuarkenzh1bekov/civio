"use client";

import { ArrowUpRight, FileDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Field, inputClass } from "@/components/documents/Field";
import { fillForm8822, oneLineAddress } from "@/lib/forms/f8822";
import { US_STATES } from "@/lib/states";
import type { Profile } from "@/lib/types";

const KEY = "civio:form8822";

type Fields = {
  name: string;
  spouseName: string;
  priorNames: string;
  oldStreet: string;
  oldCity: string;
  oldState: string;
  oldZip: string;
  newStreet: string;
  newCity: string;
  newState: string;
  newZip: string;
  phone: string;
  separateResidence: boolean;
};

/** Names and addresses stay in this browser only: they are not part of the synced session. */
function load(profile: Profile): Fields {
  const base: Fields = {
    name: "", spouseName: "", priorNames: "", oldStreet: "", oldCity: "", oldState: profile.currentState ?? "", oldZip: "",
    newStreet: "", newCity: "", newState: profile.destinationState ?? "", newZip: profile.zip ?? "", phone: "", separateResidence: false,
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Fields>), oldState: profile.currentState ?? base.oldState, newState: profile.destinationState ?? base.newState };
  } catch {
    // Fall through to the defaults.
  }
  return base;
}

function StateSelect({ label, value, onChange }: { label: string; value: string; onChange: (code: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Select…</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * IRS Form 8822 (Change of Address), filled in on this device. The official PDF is loaded from
 * the app, its own fields get the values typed here, and the result is saved as a file. Nothing is
 * sent anywhere. Social security numbers and signatures are left empty on purpose.
 */
export function TaxForm8822({ profile }: { profile: Profile }) {
  const [fields, setFieldsState] = useState<Fields>(() => load(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (patch: Partial<Fields>) => {
    const next = { ...fields, ...patch };
    setFieldsState(next);
    setDone(false);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Kept for this visit only.
    }
  };

  const oldAddress = oneLineAddress({ street: fields.oldStreet, city: fields.oldCity, state: fields.oldState, zip: fields.oldZip });
  const newAddress = oneLineAddress({ street: fields.newStreet, city: fields.newCity, state: fields.newState, zip: fields.newZip });
  const missing = [
    !fields.name.trim() && "your name",
    !(fields.oldStreet.trim() && fields.oldCity.trim() && fields.oldState) && "your old address",
    !(fields.newStreet.trim() && fields.newCity.trim() && fields.newState) && "your new address",
  ].filter(Boolean) as string[];

  const generate = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/forms/f8822.pdf");
      if (!response.ok) throw new Error(String(response.status));
      const bytes = await fillForm8822(await response.arrayBuffer(), {
        name: fields.name,
        spouseName: fields.spouseName,
        priorNames: fields.priorNames,
        oldAddress,
        newAddress,
        phone: fields.phone,
        separateResidence: fields.separateResidence,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "Form-8822-change-of-address.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(true);
    } catch {
      setError("The form could not be filled in. Download the blank form from irs.gov and type the answers in by hand.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="f8822-title" className="tile mt-6 overflow-hidden print:hidden">
      <div className="p-6 pb-4">
        <p className="mono-label text-ink-muted">Tax form · Free</p>
        <h2 id="f8822-title" className="mt-1 text-xl font-semibold tracking-tight">
          IRS Form 8822: Change of Address
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          The IRS sends notices and refunds to the address it has on file. Answer a few questions and Civio fills in the official form
          for you. You sign it and mail it.
        </p>
      </div>

      <div className="grid gap-x-6 gap-y-5 border-t border-line p-6 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <Field label="Your name" value={fields.name} onChange={(name) => set({ name })} placeholder="First, initial, last" autoComplete="name" />
          <Field label="Spouse's name (if they share the change)" value={fields.spouseName} onChange={(spouseName) => set({ spouseName })} />
          <Field label="Your prior names (if any)" value={fields.priorNames} onChange={(priorNames) => set({ priorNames })} />
          <Field label="Daytime phone (optional)" value={fields.phone} onChange={(phone) => set({ phone })} autoComplete="tel" maxLength={20} inputMode="tel" />
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={fields.separateResidence}
              onChange={(e) => set({ separateResidence: e.target.checked })}
              className="mt-0.5 size-4 accent-[var(--color-ink)]"
            />
            <span>My last return was joint and I now have a residence separate from my spouse</span>
          </label>
        </div>

        <div className="grid content-start gap-5">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">Old address</legend>
            <Field label="Street and apt. no." value={fields.oldStreet} onChange={(oldStreet) => set({ oldStreet })} autoComplete="off" />
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field label="City" value={fields.oldCity} onChange={(oldCity) => set({ oldCity })} />
              <Field label="ZIP" value={fields.oldZip} onChange={(oldZip) => set({ oldZip })} maxLength={10} inputMode="numeric" />
            </div>
            <StateSelect label="State" value={fields.oldState} onChange={(oldState) => set({ oldState })} />
          </fieldset>
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">New address</legend>
            <Field label="Street and apt. no." value={fields.newStreet} onChange={(newStreet) => set({ newStreet })} autoComplete="street-address" />
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field label="City" value={fields.newCity} onChange={(newCity) => set({ newCity })} autoComplete="address-level2" />
              <Field label="ZIP" value={fields.newZip} onChange={(newZip) => set({ newZip })} maxLength={10} inputMode="numeric" autoComplete="postal-code" />
            </div>
            <StateSelect label="State" value={fields.newState} onChange={(newState) => set({ newState })} />
          </fieldset>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-panel/60 px-6 py-4">
        <button type="button" onClick={() => void generate()} disabled={busy || missing.length > 0} className="btn btn-primary">
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileDown className="size-4" aria-hidden="true" />}
          {busy ? "Filling in…" : "Download filled Form 8822"}
        </button>
        <p className="min-w-0 flex-1 basis-60 text-sm text-ink-muted" aria-live="polite">
          {missing.length > 0 ? `Still needed: ${missing.join(", ")}.` : done ? "Saved. Open the PDF, check it, then sign and date it." : "Ready."}
        </p>
      </div>
      {error && (
        <p role="alert" className="border-t border-line px-6 py-3 text-sm text-risk">
          {error}
        </p>
      )}

      <div className="grid gap-3 border-t border-line p-6 text-sm sm:grid-cols-2">
        <p className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
          <span>
            Filled in on your device. Your name and addresses are not sent to Civio, and Civio never asks for your social security number.
          </span>
        </p>
        <div>
          <p className="font-semibold">Before you mail it</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted">
            <li>Write your social security number in the boxes on lines 3b and 4b.</li>
            <li>Sign and date Part II. The form is not valid unsigned.</li>
            <li>Mail it to the address listed for your old state in the form's instructions. Do not attach it to a tax return.</li>
          </ul>
          <a
            href="https://www.irs.gov/forms-pubs/about-form-8822"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-ink underline-offset-4 hover:underline"
          >
            IRS: About Form 8822 <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
          <p className="mt-1 text-xs text-ink-muted">Official form, Rev. February 2021, unchanged apart from the fields filled in.</p>
        </div>
      </div>
    </section>
  );
}
