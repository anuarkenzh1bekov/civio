"use client";

import { ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { IntakeResponse } from "@/app/api/intake/route";
import type { Profile } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Attached = { name: string; mediaType: string; data: string };

function readImage(file: File): Promise<Attached> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ name: file.name, mediaType: file.type, data: url.slice(url.indexOf(",") + 1) });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Free-text and photo intake. The server turns the input into profile fields
 * (a model when configured, built-in rules otherwise); nothing is saved here.
 * The caller merges the fields into the questionnaire and sends the user to
 * the review step, so every value is confirmed by a person before it is used.
 */
export function IntakeBox({ onRead }: { onRead: (patch: Partial<Profile>, result: IntakeResponse) => void }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<Attached | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError("Use a JPEG, PNG or WebP photo.");
    if (file.size > MAX_IMAGE_BYTES) return setError("That photo is over 5 MB. Try a smaller one.");
    setError(null);
    try {
      setImage(await readImage(file));
    } catch {
      setError("That photo could not be read.");
    }
  };

  const submit = async () => {
    if (busy || (text.trim() === "" && !image)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image: image ? { mediaType: image.mediaType, data: image.data } : undefined }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as IntakeResponse;
      if (result.found.length === 0) {
        setError(result.notice ?? "Nothing in that matched a question. Try naming both states, or fill in the form below.");
        return;
      }
      onRead(result.profile, result);
    } catch {
      setError("That didn't go through. Check your connection, or fill in the form below.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-night-line bg-night p-4 sm:p-5">
      <label htmlFor={id} className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4 text-lime" aria-hidden="true" /> Describe your move in your own words
      </label>
      <p className="mt-1 text-sm text-night-muted">
        Any language. You check every answer before the plan is built.
      </p>
      <textarea
        id={id}
        rows={3}
        value={text}
        maxLength={4000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="e.g. Moving from Austin to San Diego on January 1. I have a car and insurance through my employer…"
        className="night-field mt-3 h-auto resize-y py-3"
      />

      {image && (
        <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-night-line px-3 py-1.5 text-sm">
          <ImagePlus className="size-4 shrink-0 text-lime" aria-hidden="true" />
          <span className="truncate">{image.name}</span>
          <button type="button" onClick={() => setImage(null)} aria-label="Remove photo" className="grid size-6 place-items-center">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void submit()} disabled={busy || (text.trim() === "" && !image)} className="btn btn-lime">
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {busy ? "Reading…" : "Fill in my answers"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-night">
          <ImagePlus className="size-4" aria-hidden="true" /> Add a photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Photo of a license, insurance card or lease"
          onChange={(e) => {
            void attach(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-night-muted">License, insurance card or lease. The photo is read once and not stored.</span>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-lime">
          {error}
        </p>
      )}
    </div>
  );
}
