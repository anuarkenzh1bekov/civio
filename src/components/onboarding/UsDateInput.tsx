"use client";

import { useState } from "react";

/** yyyy-mm-dd → mm/dd/yyyy */
function toUs(iso?: string): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** mm/dd/yyyy → yyyy-mm-dd, or undefined when it is not a real calendar date. */
function toIso(us: string): string | undefined {
  const m = us.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

/** Add the slashes as the person types digits. */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * A date field that always reads mm/dd/yyyy. The browser's own date input follows the
 * computer's language (dd.mm.yyyy on a Russian system), which looks wrong in an app for U.S. moves.
 */
export function UsDateInput({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  /** yyyy-mm-dd */
  value?: string;
  onChange: (iso: string | undefined) => void;
  className?: string;
}) {
  const [text, setText] = useState(toUs(value));
  // The chat can fill the date too: follow it when the value changes from outside.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== toIso(text)) setText(toUs(value));
  }
  const invalid = text.length === 10 && !toIso(text);

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="mm/dd/yyyy"
      maxLength={10}
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const next = mask(e.target.value);
        setText(next);
        onChange(toIso(next));
      }}
      className={className}
    />
  );
}
