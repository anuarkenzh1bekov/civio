"use client";

import { ArrowUp, ArrowUpRight, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/Logo";
import type { Profile } from "@/lib/types";

type Source = { ruleId: string; name: string; url: string; lastVerified: string; verified: boolean };

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  mode?: "ai" | "rules_only";
  error?: string;
  pending?: boolean;
};

type ServerEvent =
  | { type: "sources"; sources: Source[]; mode: "ai" | "rules_only" }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

const SUGGESTIONS = [
  "Which tasks should I complete first?",
  "Do I need to file taxes in both states?",
  "What happens to my insurance after moving?",
  "What documents do I need for my child's school?",
];

/** Strip everything the assistant has no use for before the profile leaves the browser. */
function shareable(profile: Profile): Profile {
  const { zip: _zip, aiConsent: _consent, vehicleRegisteredInCurrentState: _reg, ...rest } = profile;
  return rest;
}

export function AssistantPanel({
  profile,
  consent,
  onConsentChange,
  seed,
  onClose,
}: {
  profile: Profile;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  /** A question handed over from a task ("Ask about this"). The nonce makes repeats count. */
  seed: { text: string; nonce: number } | null;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || abortRef.current) return;

      const userMessage: Message = { id: nextId.current++, role: "user", content: text };
      const replyId = nextId.current++;
      const history = [...messagesRef.current.filter((m) => m.content && !m.error), userMessage];
      setMessages((prev) => [...prev, userMessage, { id: replyId, role: "assistant", content: "", pending: true }]);
      setDraft("");
      setBusy(true);

      const patch = (change: (m: Message) => Message) =>
        setMessages((prev) => prev.map((m) => (m.id === replyId ? change(m) : m)));

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })),
            profile: consent ? shareable(profile) : null,
          }),
        });
        if (!response.ok || !response.body) throw new Error(`Request failed (${response.status})`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as ServerEvent;
            if (event.type === "sources") patch((m) => ({ ...m, sources: event.sources, mode: event.mode }));
            else if (event.type === "text") patch((m) => ({ ...m, content: m.content + event.delta }));
            else if (event.type === "error") patch((m) => ({ ...m, error: event.message }));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
          patch((m) => ({ ...m, error: "Couldn't reach the assistant. Check your connection and try again." }));
        }
      } finally {
        patch((m) => ({ ...m, pending: false }));
        abortRef.current = null;
        setBusy(false);
      }
    },
    [consent, profile],
  );

  const lastSeed = useRef(0);
  useEffect(() => {
    if (seed && seed.nonce !== lastSeed.current) {
      lastSeed.current = seed.nonce;
      void ask(seed.text);
    }
  }, [seed, ask]);

  return (
    <section aria-label="Civio assistant" className="flex h-full min-h-0 flex-col rounded-panel border border-line bg-raised shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-oxblood text-on-oxblood">
            <LogoMark className="size-4" />
          </span>
          <div>
            <h2 className="font-sans text-[0.9375rem] font-semibold leading-tight">Ask Civio</h2>
            <p className="text-xs text-muted">Explains your rules. Doesn't set deadlines.</p>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close assistant" className="grid size-10 place-items-center rounded-full text-muted">
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-muted">Try one of these, or ask in your own words.</p>
            <div className="mt-3 grid gap-2">
              {SUGGESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void ask(question)}
                  className="rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm font-medium transition-colors duration-150 hover:border-taupe"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="grid gap-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="fade ml-8 justify-self-end rounded-2xl rounded-br-md bg-espresso px-4 py-2.5 text-sm text-on-dark">
                  {m.content}
                </li>
              ) : (
                <li key={m.id} className="fade mr-4">
                  {m.mode === "rules_only" && (
                    <p className="mb-2 inline-block rounded-full bg-amber-wash px-2.5 py-1 text-xs font-semibold text-amber">
                      Rules only · no AI key configured
                    </p>
                  )}
                  {m.pending && !m.content && !m.error ? (
                    <div className="grid gap-2" aria-label="Loading answer">
                      <div className="skeleton h-3.5 w-11/12" />
                      <div className="skeleton h-3.5 w-8/12" />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                  )}
                  {m.error && (
                    <p role="alert" className="mt-2 rounded-xl bg-oxblood-wash px-3 py-2 text-sm text-oxblood">
                      {m.error}
                    </p>
                  )}
                  {!m.pending && m.sources && m.sources.length > 0 && (
                    <div className="mt-3">
                      <p className="mono-label text-muted">Sources</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {m.sources.slice(0, 4).map((s) => (
                          <li key={s.url}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                s.verified ? "bg-moss-wash text-moss" : "bg-amber-wash text-amber"
                              }`}
                            >
                              {s.name.split(" — ")[0]}
                              {!s.verified && " · unverified"}
                              <ArrowUpRight className="size-3" aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <footer className="border-t border-line p-4">
        <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 text-xs text-muted">
          <span>{consent ? "Answers use your profile" : "Profile not shared: answers stay general"}</span>
          <input
            type="checkbox"
            role="switch"
            checked={consent}
            onChange={(e) => onConsentChange(e.target.checked)}
            aria-label="Share my profile with the assistant"
            className="size-4 accent-(--color-moss)"
          />
        </label>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <label htmlFor="assistant-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="assistant-input"
            rows={1}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            placeholder="Ask about your move…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-base placeholder:text-muted"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop answering"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-espresso text-on-dark"
            >
              <Square className="size-3.5" fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send question"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-oxblood text-on-oxblood disabled:opacity-40"
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </button>
          )}
        </form>
      </footer>
    </section>
  );
}
