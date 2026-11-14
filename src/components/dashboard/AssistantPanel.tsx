"use client";

import { Citation } from "@astryxdesign/core/Citation";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Switch } from "@astryxdesign/core/Switch";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** One answer. Rule ids in the text ([CA-VEH-REG]) become citations that link to the official source. */
function Answer({ message }: { message: Message }) {
  const sources = useMemo(
    () =>
      Object.fromEntries(
        (message.sources ?? []).map((s) => [
          s.ruleId,
          { title: s.verified ? s.name : `${s.name} (not verified for this state)`, url: s.url },
        ]),
      ),
    [message.sources],
  );
  // Distinct source pages, in the order the rules were retrieved.
  const pages = useMemo(() => {
    const seen = new Set<string>();
    return (message.sources ?? []).filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 4);
  }, [message.sources]);

  return (
    <li className="fade">
      {message.mode === "rules_only" && (
        <p className="mb-2 inline-block rounded-full bg-amber-wash px-2.5 py-1 text-xs font-semibold text-amber">
          Rules only · no AI key configured
        </p>
      )}
      {message.pending && !message.content && !message.error ? (
        <div className="grid gap-2" aria-label="Loading answer">
          <div className="skeleton h-3.5 w-11/12" />
          <div className="skeleton h-3.5 w-8/12" />
        </div>
      ) : (
        <Markdown density="compact" isStreaming={message.pending} sources={sources} headingLevelStart={3}>
          {message.content}
        </Markdown>
      )}
      {message.error && (
        <p role="alert" className="mt-2 rounded-xl bg-oxblood-wash px-3 py-2 text-sm text-oxblood">
          {message.error}
        </p>
      )}
      {!message.pending && pages.length > 0 && (
        <div className="mt-3">
          <p className="mono-label text-muted">Sources</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pages.map((s, index) => (
              <li key={s.url}>
                <Citation
                  number={index + 1}
                  variant="label"
                  source={{ title: s.name.split(" — ")[0] + (s.verified ? "" : " · unverified"), url: s.url }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function AssistantPanel({
  profile,
  consent,
  onConsentChange,
  seed,
}: {
  profile: Profile;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  /** A question handed over from a task ("Ask about this"). The nonce makes repeats count. */
  seed: { text: string; nonce: number } | null;
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
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-muted">Try one of these, or ask in your own words.</p>
            <div className="mt-3 grid gap-2">
              {SUGGESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void ask(question)}
                  className="rounded-2xl bg-mist px-4 py-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-hair"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="grid gap-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="fade ml-8 justify-self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-white">
                  {m.content}
                </li>
              ) : (
                <Answer key={m.id} message={m} />
              ),
            )}
          </ul>
        )}
      </div>

      <footer className="border-t border-hair pt-4">
        <div className="mb-3">
          <Switch
            label={consent ? "Answers use your profile" : "Profile not shared: answers stay general"}
            value={consent}
            onChange={onConsentChange}
          />
        </div>
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
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-mist px-4 py-2.5 text-base placeholder:text-muted"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop answering"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white"
            >
              <Square className="size-3.5" fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send question"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}
