"use client";

import { ArrowUp, Check, ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatIntakeResponse } from "@/app/api/intake/chat/route";
import type { IntakeResponse } from "@/app/api/intake/route";
import {
  applyPatch,
  describePatch,
  diffPatch,
  nextQuestion,
  progress,
  SUPPORTED_STATES,
  type Chip,
  type FlowField,
} from "@/lib/intake/flow";
import { stateName } from "@/lib/states";
import type { Profile } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Attached = { name: string; mediaType: string; data: string };
type Msg = { id: number; role: "assistant" | "user"; text: string; chips?: Chip[]; finished?: boolean };

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

const GREETING =
  "Hi, I'm Civio. Tell me about your move in your own words, or just tap the answers. I fill in the form as we talk, and you check everything before your plan is built.";

/**
 * A guided chat that fills in the questionnaire. The order of the questions comes from
 * `nextQuestion` (plain code); the model only reads each reply into fields. Every field it
 * sets appears in the form at once, and the review step still asks the person to confirm.
 */
export function ChatIntake({
  profile,
  onPatch,
  onReview,
}: {
  profile: Profile;
  onPatch: (patch: Partial<Profile>) => void;
  onReview: (result: IntakeResponse) => void;
}) {
  const today = useRef(new Date().toISOString().slice(0, 10)).current;
  const latest = useRef(profile);
  latest.current = profile;

  const idRef = useRef(0);
  const skippedRef = useRef<FlowField[]>([]);
  const askingRef = useRef<FlowField | null>(null);
  const foundRef = useRef(new Map<string, { field: keyof Profile; label: string; value: string; from: string }>());
  const modeRef = useRef<"ai" | "rules_only">("rules_only");
  const noticeRef = useRef<string | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<Msg[]>(() => {
    const first = nextQuestion(profile, [], today);
    askingRef.current = first?.field ?? null;
    const list: Msg[] = [{ id: ++idRef.current, role: "assistant", text: GREETING }];
    if (first) list.push({ id: ++idRef.current, role: "assistant", text: first.text, chips: first.chips });
    return list;
  });
  const [skipped, setSkipped] = useState<FlowField[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<Attached | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    if (fresh.length === 0) return;
    const timer = setTimeout(() => setFresh([]), 1200);
    return () => clearTimeout(timer);
  }, [fresh]);

  const push = (message: Omit<Msg, "id">) => setMessages((prev) => [...prev, { ...message, id: ++idRef.current }]);

  /** Ask the next question (or close the conversation), with a short lead-in. */
  const ask = (lead: string) => {
    const question = nextQuestion(latest.current, skippedRef.current, today);
    askingRef.current = question?.field ?? null;
    if (question) push({ role: "assistant", text: `${lead} ${question.text}`.trim(), chips: question.chips });
    else push({ role: "assistant", text: `${lead} That's everything I need. Check your answers, then I'll build your plan.`.trim(), finished: true });
  };

  /** Merge a patch into the form, record what changed, and describe it. Returns the lead-in for the reply. */
  const absorb = (patch: Partial<Profile>, declined: FlowField[]): string => {
    const before = latest.current;
    const merged = applyPatch(before, patch);
    const diff = diffPatch(before, merged);
    const notes: string[] = [];

    if (declined.length) {
      skippedRef.current = [...new Set([...skippedRef.current, ...declined])];
      setSkipped(skippedRef.current);
    }
    if (Object.keys(diff).length) {
      latest.current = merged;
      onPatch(diff);
      const described = describePatch(diff);
      for (const item of described) foundRef.current.set(item.field, { field: item.field, label: item.text, value: "", from: "" });
      setFresh(described.map((item) => item.field));
      notes.push(`Got it: ${described.map((item) => item.text).join(" · ")}.`);
    }
    if (patch.destinationState && merged.destinationState !== patch.destinationState) {
      notes.push("That is the state you are moving from, so I kept your earlier answer for the destination.");
    } else if (patch.currentState && merged.currentState !== patch.currentState) {
      notes.push("That is the state you are moving to, so I kept your earlier answer for where you live now.");
    }
    for (const code of [diff.currentState, diff.destinationState]) {
      if (code && !(SUPPORTED_STATES as readonly string[]).includes(code)) {
        notes.push(
          `I only have verified rules for ${SUPPORTED_STATES.map(stateName).join(", ")}. For ${stateName(code)} you get a checklist that points to the official agencies.`,
        );
      }
    }
    if (declined.length && notes.length === 0) notes.push("No problem.");
    return notes.join(" ");
  };

  const choose = (chip: Chip) => {
    if (busy) return;
    push({ role: "user", text: chip.label });
    const lead = absorb(chip.patch ?? {}, chip.skip ? [chip.skip] : []);
    // A short pause so the answer reads as a reply, not a refresh.
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      ask(lead);
    }, 280);
  };

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

  const send = async () => {
    const content = text.trim();
    if (busy || (content === "" && !image)) return;
    const photo = image;
    const userMessage: Msg = { id: ++idRef.current, role: "user", text: content || `Photo: ${photo?.name ?? "document"}` };
    const history = [...messages, userMessage].slice(-6).map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, userMessage]);
    setText("");
    setImage(null);
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/intake/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          profile: latest.current,
          asking: askingRef.current,
          image: photo ? { mediaType: photo.mediaType, data: photo.data } : undefined,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as ChatIntakeResponse;
      modeRef.current = result.mode;
      noticeRef.current = result.notice;
      const lead = absorb(result.profile, result.declined);
      ask(lead || "I couldn't pick that up.");
    } catch {
      push({
        role: "assistant",
        text: "That didn't go through. Tap one of the answers, or use the form below.",
        chips: nextQuestion(latest.current, skippedRef.current, today)?.chips,
      });
    } finally {
      setBusy(false);
    }
  };

  const review = () => {
    // Facts typed into the form after the chat are not in the chat's list, so describe the whole profile.
    for (const item of describePatch(latest.current)) {
      if (!foundRef.current.has(item.field)) foundRef.current.set(item.field, { field: item.field, label: item.text, value: "", from: "" });
    }
    onReview({ profile: latest.current, found: [...foundRef.current.values()], mode: modeRef.current, notice: noticeRef.current });
  };

  const facts = describePatch(profile);
  const { done, total } = progress(profile, skipped);
  const canReview = Boolean(profile.currentState && profile.destinationState);
  const finished = nextQuestion(profile, skipped, today) === null;
  const lastId = messages.at(-1)?.id;

  return (
    <section aria-labelledby="chat-title" className="overflow-hidden rounded-2xl border border-stage-line bg-stage">
      <header className="flex items-center justify-between gap-4 border-b border-stage-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-bright text-stage">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="chat-title" className="truncate text-[0.9375rem] font-semibold leading-tight">
              Tell Civio about your move
            </h2>
            <p className="text-xs text-on-stage-muted">Any language. I fill in the form as we talk.</p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex" aria-label={`${done} of ${total} questions answered`}>
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-stage-line">
            <span className="block h-full rounded-full bg-brand-bright transition-[width] duration-300" style={{ width: `${(done / total) * 100}%` }} />
          </span>
          <span className="font-mono text-xs text-on-stage-muted">
            {done}/{total}
          </span>
        </div>
      </header>

      <div ref={scroller} role="log" aria-live="polite" aria-label="Conversation" className="grid max-h-[22rem] min-h-40 gap-3 overflow-y-auto px-4 py-4 sm:px-5">
        {messages.map((message) => (
          <div key={message.id} className="rise grid gap-2">
            <p
              className={`max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed ${
                message.role === "user"
                  ? "ml-auto rounded-tr-md bg-on-stage text-stage"
                  : "rounded-tl-md border border-stage-line bg-stage-raised"
              }`}
            >
              {message.text}
            </p>
            {message.id === lastId && message.chips && !busy && (
              <div className="flex flex-wrap gap-2">
                {message.chips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => choose(chip)}
                    className="min-h-10 rounded-full border border-stage-line bg-stage-raised px-4 text-sm font-medium transition-colors duration-150 hover:border-on-stage-muted"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            {message.id === lastId && message.finished && canReview && (
              <div>
                <button type="button" onClick={review} className="btn btn-stage">
                  <Check className="size-4" aria-hidden="true" /> Review my answers
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="chat-dots flex w-fit items-center gap-1.5 rounded-2xl rounded-tl-md border border-stage-line bg-stage-raised px-4 py-3.5" role="status" aria-label="Civio is typing">
            <span /> <span /> <span />
          </p>
        )}
      </div>

      {facts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-stage-line px-4 py-3 sm:px-5">
          <span className="mono-label mr-1 text-on-stage-muted">In your form</span>
          {facts.map((fact) => (
            <span
              key={fact.field}
              className={`inline-flex items-center gap-1.5 rounded-full border border-brand-bright/40 bg-brand-bright/10 px-2.5 py-1 text-xs font-medium ${
                fresh.includes(fact.field) ? "chat-fresh" : ""
              }`}
            >
              <Check className="size-3 text-brand-bright" strokeWidth={3} aria-hidden="true" />
              {fact.text}
            </span>
          ))}
          {canReview && !finished && (
            <button type="button" onClick={review} className="ml-auto text-xs font-medium text-on-stage-muted underline underline-offset-4 hover:text-on-stage">
              Skip the rest and review
            </button>
          )}
        </div>
      )}

      {/* A div, not a form: this component sits inside the wizard's own form. */}
      <div className="border-t border-stage-line p-3 sm:p-4">
        {image && (
          <p className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-stage-line px-3 py-1.5 text-sm">
            <ImagePlus className="size-4 shrink-0 text-brand-bright" aria-hidden="true" />
            <span className="truncate">{image.name}</span>
            <button type="button" onClick={() => setImage(null)} aria-label="Remove photo" className="grid size-6 place-items-center">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Add a photo of a license, insurance card or lease"
            title="Add a photo of a license, insurance card or lease. It is read once and not stored."
            className="btn btn-stage-quiet size-11 shrink-0 !p-0"
          >
            <ImagePlus className="size-5" aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <textarea
            rows={1}
            value={text}
            maxLength={2000}
            disabled={busy}
            aria-label="Your message"
            placeholder="e.g. Moving from Austin to San Diego on January 1. I have a car…"
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              e.target.style.overflowY = e.target.scrollHeight > 128 ? "auto" : "hidden";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            className="stage-field h-11 min-h-11 flex-1 resize-none overflow-hidden py-2.5"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (text.trim() === "" && !image)}
            aria-label="Send"
            className="btn btn-stage size-11 shrink-0 !p-0"
          >
            {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-5" aria-hidden="true" />}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-brand-bright">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
