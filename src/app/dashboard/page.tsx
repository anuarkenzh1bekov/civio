"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  FileText,
  Folder,
  House,
  LayoutGrid,
  MessageCircle,
  RotateCcw,
  Search,
  UserRoundPen,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { Logo } from "@/components/Logo";
import { CATEGORY_SHORT, CategoryIcon, PriorityBadge, StatusBadge } from "@/components/ui";
import { daysUntil, formatDate, formatShortDate } from "@/lib/format";
import { stateName } from "@/lib/states";
import { useCivio, type PlanTask } from "@/lib/store";
import { CATEGORY_LABEL, type Category, type TaskStatus } from "@/lib/types";

const CATEGORIES: Category[] = ["taxes", "health", "vehicle", "family"];
const STATUSES: { value: "all" | TaskStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "needs_verification", label: "To review" },
  { value: "done", label: "Done" },
];

/** One tint per module, used by the donut, the folders and the sidebar tree. */
const TINT: Record<Category, string> = {
  taxes: "var(--color-rose)",
  health: "var(--color-moss-fill)",
  vehicle: "var(--color-sky)",
  family: "var(--color-peach)",
};

const MONEY_LABEL = { fee: "Fee", penalty: "Penalty risk", tax: "Tax", coverage: "Coverage gap" } as const;

function dueText(task: PlanTask): { text: string; urgent: boolean } | null {
  if (!task.deadline) return null;
  if (!task.deadline.date) return { text: task.deadline.label, urgent: false };
  const days = daysUntil(task.deadline.date);
  const date = formatDate(task.deadline.date);
  if (days === null || task.displayStatus === "done") return { text: date, urgent: false };
  if (days < 0) return { text: `${date} · ${-days} ${days === -1 ? "day" : "days"} overdue`, urgent: true };
  if (days === 0) return { text: `Today, ${date}`, urgent: true };
  return { text: `${date} · in ${days} ${days === 1 ? "day" : "days"}`, urgent: days <= 14 };
}

/** Tasks per module as a donut. Segment length is the module's share of all tasks. */
function ModuleDonut({ counts, total }: { counts: Record<Category, number>; total: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 ? 5 : 0;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="size-40 shrink-0 -rotate-90" role="img" aria-label="Tasks by module">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-mist)" strokeWidth="14" />
      {CATEGORIES.map((category) => {
        const share = total > 0 ? counts[category] / total : 0;
        const length = Math.max(0, share * circumference - gap);
        const start = offset;
        offset += share * circumference;
        if (counts[category] === 0) return null;
        return (
          <circle
            key={category}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={TINT[category]}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-start}
          />
        );
      })}
    </svg>
  );
}

/** A soft glass folder, tinted per module. */
function FolderArt({ tint, sheets }: { tint: string; sheets: number }) {
  return (
    <div className="relative h-24" aria-hidden="true">
      <div className="absolute inset-x-0 bottom-0 top-3 rounded-2xl" style={{ background: tint, opacity: 0.55 }} />
      <div className="absolute left-0 top-0 h-6 w-2/5 rounded-t-xl" style={{ background: tint, opacity: 0.55 }} />
      {Array.from({ length: Math.min(sheets, 3) }).map((_, i) => (
        <div
          key={i}
          className="absolute top-1 h-14 w-2/5 rounded-md bg-white shadow-soft"
          style={{ left: `${14 + i * 20}%`, transform: `rotate(${-6 + i * 6}deg)` }}
        >
          <span className="mx-2 mt-2.5 block h-1 rounded-full bg-hair" />
          <span className="mx-2 mt-1.5 block h-1 w-1/2 rounded-full bg-hair" />
        </div>
      ))}
      <div
        className="absolute inset-x-0 bottom-0 h-14 rounded-2xl border border-white/60 backdrop-blur-sm"
        style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${tint} 70%, white), ${tint})`, opacity: 0.92 }}
      />
    </div>
  );
}

function TaskRow({
  task,
  index,
  open,
  onToggleOpen,
  onToggleDone,
  onAsk,
}: {
  task: PlanTask;
  index: number;
  open: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onAsk: () => void;
}) {
  const done = task.displayStatus === "done";
  const due = dueText(task);
  const panelId = `task-${task.id}`;

  return (
    <li
      id={`row-${task.id}`}
      className="rise border-t border-hair first:border-t-0"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <div className="flex items-start gap-3 px-4 py-3.5 md:items-center md:px-5">
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-150 md:size-7 ${
            done ? "border-moss bg-moss text-white" : "border-taupe bg-white text-transparent hover:border-moss"
          }`}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="grid min-w-0 flex-1 gap-2 text-left md:grid-cols-[minmax(0,1fr)_7.5rem_13rem_10.5rem_1.25rem] md:items-center md:gap-4"
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="hidden size-4 shrink-0 text-taupe md:block" strokeWidth={1.75} aria-hidden="true" />
            <span className={`truncate font-medium ${done ? "text-muted line-through decoration-taupe" : ""}`}>
              {task.title}
            </span>
            {!done && <PriorityBadge priority={task.priority} />}
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="size-2.5 rounded-full" style={{ background: TINT[task.category] }} aria-hidden="true" />
            {CATEGORY_SHORT[task.category]}
          </span>
          <span className={`text-sm md:truncate ${due?.urgent ? "font-semibold text-oxblood" : "text-muted"}`}>
            {due ? due.text : "No deadline recorded"}
          </span>
          <span>
            <StatusBadge status={task.displayStatus} />
          </span>
          <ChevronDown
            className={`hidden size-5 text-muted transition-transform duration-200 md:block ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div id={panelId} className="fade border-t border-hair bg-mist/60 px-4 py-5 md:px-5">
          {task.verificationNote && !done && (
            <p className="mb-5 rounded-2xl bg-amber-wash px-4 py-3 text-sm text-amber">{task.verificationNote}</p>
          )}
          <p className="max-w-prose">{task.description}</p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mono-label text-muted">How to do it</h4>
              <ol className="mt-3 grid gap-2.5 text-sm">
                {task.steps.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white font-mono text-[0.6875rem] text-muted ring-1 ring-hair">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h4 className="mono-label text-muted">Documents</h4>
              <ul className="mt-3 grid gap-2.5 text-sm">
                {task.documents.map((doc) => (
                  <li key={doc} className="flex gap-2.5">
                    <FileText className="mt-0.5 size-4 shrink-0 text-taupe" strokeWidth={1.75} aria-hidden="true" />
                    {doc}
                  </li>
                ))}
              </ul>
              {task.financial && (
                <>
                  <h4 className="mono-label mt-6 text-muted">Money impact · {MONEY_LABEL[task.financial.kind]}</h4>
                  <p className="mt-3 text-sm">{task.financial.note}</p>
                </>
              )}
            </div>
          </div>

          {task.deadline?.date && (
            <p className="mt-6 text-sm text-muted">
              <span className="font-semibold text-ink">Deadline as the source words it:</span> {task.deadline.label}. The
              date counts from your planned move date.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-hair">
            <a
              href={task.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss underline-offset-4 hover:underline"
            >
              {task.source.name} <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
            <span className="font-mono text-xs text-muted">
              {task.verificationNote?.startsWith("Civio has no")
                ? "directory link, rule not verified"
                : `checked ${formatDate(task.source.lastVerified)}`}
              {task.source.effectiveDate ? ` · in effect since ${formatDate(task.source.effectiveDate)}` : ""}
            </span>
            <span className="font-mono text-xs text-muted sm:ml-auto">{task.ruleId}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onToggleDone} className="btn btn-ink">
              {done ? "Mark as not done" : "Mark as done"}
            </button>
            <button type="button" onClick={onAsk} className="btn btn-quiet">
              <MessageCircle className="size-4" aria-hidden="true" /> Ask about this
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <div className="min-h-dvh bg-mist px-5 py-10 sm:px-8" aria-busy="true" aria-label="Loading your plan">
      <div className="mx-auto max-w-6xl">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-4 h-10 w-80 max-w-full" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-56" />
          ))}
        </div>
        <div className="skeleton mt-6 h-72" />
      </div>
    </div>
  );
}

function NoPlan({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-mist px-5">
      <div className="tile max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-mist text-ink">
          <LayoutGrid className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">No plan yet</h1>
        <p className="mt-2 text-muted">Answer a few questions about your move and Civio builds your checklist.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/onboarding" className="btn btn-ink">
            Get Started <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <button type="button" onClick={onDemo} className="btn btn-quiet">
            Load the demo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { ready, hasPlan, isDemo, profile, tasks, toggleDone, setConsent, loadDemo, reset } = useCivio();
  const [category, setCategory] = useState<"all" | Category>("all");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [moneyOnly, setMoneyOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // /dashboard?demo=1 loads the sample plan, then cleans the URL.
  useEffect(() => {
    if (!ready) return;
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      loadDemo();
      router.replace("/dashboard");
    }
  }, [ready, loadDemo, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setAssistantOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const of = (c: Category) => tasks.filter((t) => t.category === c);
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, of(c).length])) as Record<Category, number>;
    const doneByCategory = Object.fromEntries(
      CATEGORIES.map((c) => [c, of(c).filter((t) => t.displayStatus === "done").length]),
    ) as Record<Category, number>;
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.displayStatus === "done").length,
      review: tasks.filter((t) => t.displayStatus === "needs_verification").length,
      money: tasks.filter((t) => t.financial && t.displayStatus !== "done").length,
      byCategory,
      doneByCategory,
    };
  }, [tasks]);

  const upcoming = useMemo(() => tasks.filter((t) => t.displayStatus !== "done").slice(0, 3), [tasks]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (category === "all" || t.category === category) &&
        (status === "all" || t.displayStatus === status) &&
        (!moneyOnly || t.financial !== null) &&
        (!needle || `${t.title} ${t.description} ${CATEGORY_LABEL[t.category]}`.toLowerCase().includes(needle)),
    );
  }, [tasks, category, status, moneyOnly, query]);

  if (!ready) return <Skeleton />;
  if (!hasPlan) return <NoPlan onDemo={loadDemo} />;

  const percent = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const filtered = category !== "all" || status !== "all" || moneyOnly || query.trim() !== "";
  const clearFilters = () => {
    setCategory("all");
    setStatus("all");
    setMoneyOnly(false);
    setQuery("");
  };
  const reveal = (taskId: string) => {
    clearFilters();
    setOpenId(taskId);
    requestAnimationFrame(() =>
      document.getElementById(`row-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };
  const askAbout = (task: PlanTask) => {
    setSeed({ text: `Explain this task in plain words: “${task.title}”. What should I do first?`, nonce: Date.now() });
    setAssistantOpen(true);
  };

  const [next, ...later] = upcoming;
  const nextDue = next ? dueText(next) : null;

  return (
    <div className="min-h-dvh bg-mist lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* ── Sidebar ── */}
      <aside className="hidden border-r border-hair bg-white/70 lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-4 p-4">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink font-mono text-sm font-semibold text-white">
              {profile.destinationState}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-semibold">
                {stateName(profile.currentState)} → {stateName(profile.destinationState)}
              </span>
              <span className="block text-xs text-muted">
                {counts.total} {counts.total === 1 ? "task" : "tasks"}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-taupe" aria-hidden="true" />
          </div>

          <label className="flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 shadow-soft ring-1 ring-hair">
            <Search className="size-4 shrink-0 text-taupe" aria-hidden="true" />
            <span className="sr-only">Search tasks</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted focus-visible:outline-none"
            />
            <kbd className="rounded-md bg-mist px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted">Ctrl K</kbd>
          </label>

          <nav aria-label="Main" className="grid gap-0.5 text-[0.9375rem]">
            <button
              type="button"
              onClick={clearFilters}
              className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-left font-medium"
            >
              <House className="size-4" strokeWidth={1.75} aria-hidden="true" /> Home
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-left text-muted hover:text-ink"
            >
              <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden="true" /> Ask AI
            </button>
            <Link href="/onboarding" className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-muted hover:text-ink">
              <UserRoundPen className="size-4" strokeWidth={1.75} aria-hidden="true" /> Edit profile
            </Link>
          </nav>

          <div>
            <p className="mono-label px-3 text-muted">Modules</p>
            <div className="mt-2 grid gap-0.5 text-[0.9375rem]">
              <button
                type="button"
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
                className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-left ${
                  category === "all" ? "bg-white font-semibold shadow-soft ring-1 ring-hair" : "text-muted hover:text-ink"
                }`}
              >
                <ChevronDown className="size-3.5 text-taupe" aria-hidden="true" />
                <Folder className="size-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                <span className="flex-1">All tasks</span>
                <span className="font-mono text-xs tabular-nums text-muted">{counts.total}</span>
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={`ml-5 flex min-h-10 items-center gap-2 rounded-xl px-3 text-left ${
                    category === c ? "bg-white font-semibold shadow-soft ring-1 ring-hair" : "text-muted hover:text-ink"
                  }`}
                >
                  <Folder className="size-4" style={{ color: TINT[c] }} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  <span className="flex-1 whitespace-nowrap">{CATEGORY_LABEL[c]}</span>
                  <span className="font-mono text-xs tabular-nums text-muted">{counts.byCategory[c]}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              reset();
              router.push("/");
            }}
            className="mt-auto flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-left text-[0.9375rem] text-muted hover:text-ink"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" /> Start over
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="min-w-0 px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="lg:hidden">
                <Logo />
              </span>
              <span className="hidden items-center gap-2 lg:flex">
                Civio <ChevronRight className="size-3.5" aria-hidden="true" />
                <span className="font-medium text-ink">My dashboard</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/onboarding" className="btn btn-quiet lg:hidden" aria-label="Edit profile">
                <UserRoundPen className="size-4" aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => setAssistantOpen(true)} className="btn btn-ink">
                <MessageCircle className="size-4" aria-hidden="true" /> Ask Civio
              </button>
            </div>
          </div>

          <div className="mt-6">
            <h1 className="text-[clamp(1.75rem,3vw,2.375rem)] font-semibold leading-tight tracking-[-0.03em]">
              Your moving plan
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
              {stateName(profile.currentState)} <ArrowRight className="size-4" aria-hidden="true" />{" "}
              {stateName(profile.destinationState)}
              {profile.moveDate && <span>· moving {formatDate(profile.moveDate)}</span>}
              {isDemo && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">Demo</span>}
            </p>
          </div>

          {/* Row of three cards */}
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {/* Progress */}
            <section aria-labelledby="progress" className="tile relative flex flex-col overflow-hidden p-6">
              <div className="iris pointer-events-none absolute -right-10 -top-12 size-44 rounded-full opacity-70 blur-2xl" aria-hidden="true" />
              <h2 id="progress" className="relative font-sans text-[0.9375rem] font-semibold">
                Progress
              </h2>
              <p className="relative mt-6 flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold tabular-nums">{counts.done}</span>
                <span className="text-muted">of {counts.total} completed</span>
              </p>
              <div
                className="relative mb-8 mt-4 h-2.5 overflow-hidden rounded-full bg-mist"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Plan progress"
              >
                <div
                  className="h-full origin-left rounded-full bg-linear-to-r from-lilac to-rose transition-transform duration-500 ease-(--ease-out)"
                  style={{ transform: `scaleX(${Math.max(percent, 2) / 100})` }}
                />
              </div>
              <dl className="relative mt-auto grid grid-cols-3 gap-3 border-t border-hair pt-4">
                <div>
                  <dt className="text-xs text-muted">Tasks</dt>
                  <dd className="font-display text-2xl font-semibold tabular-nums">{counts.total}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">To review</dt>
                  <dd className="font-display text-2xl font-semibold tabular-nums text-amber">{counts.review}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Money at stake</dt>
                  <dd className="font-display text-2xl font-semibold tabular-nums text-oxblood">{counts.money}</dd>
                </div>
              </dl>
            </section>

            {/* By module */}
            <section aria-labelledby="by-module" className="tile flex flex-col p-6">
              <h2 id="by-module" className="font-sans text-[0.9375rem] font-semibold">
                Tasks by module
              </h2>
              <div className="mt-4 flex flex-1 items-center gap-5">
                <div className="relative">
                  <ModuleDonut counts={counts.byCategory} total={counts.total} />
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="text-xs text-muted">Total</p>
                      <p className="font-display text-2xl font-semibold tabular-nums">{counts.total}</p>
                    </div>
                  </div>
                </div>
                <ul className="grid min-w-0 flex-1 gap-2.5 text-sm">
                  {CATEGORIES.map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: TINT[c] }} aria-hidden="true" />
                      <span className="flex-1 truncate text-muted">{CATEGORY_LABEL[c]}</span>
                      <span className="font-mono text-xs tabular-nums">{counts.byCategory[c]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Priorities */}
            <section aria-labelledby="priorities" className="grid content-start gap-3">
              <h2 id="priorities" className="sr-only">
                Your priorities
              </h2>
              {next ? (
                <button
                  type="button"
                  onClick={() => reveal(next.id)}
                  className="iris relative overflow-hidden rounded-panel p-6 text-left text-ink shadow-soft"
                >
                  <span className="absolute inset-0 bg-white/35" aria-hidden="true" />
                  <span className="relative flex items-center justify-between text-sm font-semibold">
                    Next up
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs">
                      <CategoryIcon category={next.category} className="size-3.5" /> {CATEGORY_SHORT[next.category]}
                    </span>
                  </span>
                  <span className="relative mt-8 block font-display text-2xl font-semibold leading-tight tracking-tight">
                    {next.title}
                  </span>
                  <span className="relative mt-2 block text-sm">{nextDue ? nextDue.text : "No deadline recorded"}</span>
                </button>
              ) : (
                <div className="tile p-6">
                  <p className="font-semibold">Everything is done</p>
                  <p className="mt-1 text-sm text-muted">Nothing left on this plan.</p>
                </div>
              )}
              {later.length > 0 && (
                <ul className="tile divide-y divide-hair px-5">
                  {later.map((task) => (
                    <li key={task.id}>
                      <button type="button" onClick={() => reveal(task.id)} className="flex w-full items-center gap-3 py-3.5 text-left">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mist">
                          <CategoryIcon category={task.category} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{task.title}</span>
                          <span className="block text-xs text-muted">{CATEGORY_SHORT[task.category]}</span>
                        </span>
                        {task.deadline?.date && (
                          <span className="shrink-0 font-mono text-xs tabular-nums">{formatShortDate(task.deadline.date)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Modules as folders */}
          <h2 className="mt-10 text-xl font-semibold tracking-tight">Modules</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(active ? "all" : c)}
                  className={`rounded-panel p-4 text-left transition-colors duration-150 ${
                    active ? "bg-white shadow-soft ring-1 ring-hair" : "hover:bg-white/60"
                  }`}
                >
                  <FolderArt tint={TINT[c]} sheets={counts.byCategory[c]} />
                  <p className="mt-3 text-center font-semibold">{CATEGORY_LABEL[c]}</p>
                  <p className="text-center text-sm text-muted">
                    {counts.byCategory[c]} {counts.byCategory[c] === 1 ? "task" : "tasks"} · {counts.doneByCategory[c]} done
                  </p>
                </button>
              );
            })}
          </div>

          {/* Tasks */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              {category === "all" ? "Tasks" : CATEGORY_LABEL[category]}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={status === s.value}
                  onClick={() => setStatus(s.value)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${
                    status === s.value ? "bg-ink text-white" : "bg-white text-muted shadow-soft"
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={moneyOnly}
                onClick={() => setMoneyOnly((v) => !v)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${
                  moneyOnly ? "bg-oxblood text-on-oxblood" : "bg-white text-muted shadow-soft"
                }`}
              >
                <CircleDollarSign className="size-4" aria-hidden="true" /> Money
              </button>
            </div>
          </div>

          <div className="mt-3 lg:hidden">
            <label className="flex min-h-11 items-center gap-2 rounded-full bg-white px-4 shadow-soft">
              <Search className="size-4 shrink-0 text-taupe" aria-hidden="true" />
              <span className="sr-only">Search tasks</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks…"
                className="min-w-0 flex-1 bg-transparent text-base placeholder:text-muted focus-visible:outline-none"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="tile mt-4 p-8 text-center">
              <p className="font-semibold">No tasks match</p>
              <p className="mt-1 text-sm text-muted">
                {filtered ? "Try a different search, status or module." : "The rules found nothing for this profile."}
              </p>
              {filtered && (
                <button type="button" onClick={clearFilters} className="btn btn-quiet mt-4">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="tile mt-4 overflow-hidden">
              <div className="hidden grid-cols-[1.75rem_minmax(0,1fr)_7.5rem_13rem_10.5rem_1.25rem] items-center gap-4 bg-mist/60 px-5 py-3 text-sm text-muted md:grid">
                <span />
                <span className="-ml-1">Name</span>
                <span>Module</span>
                <span>Due</span>
                <span>Status</span>
                <span />
              </div>
              <ul key={`${category}-${status}-${moneyOnly}`}>
                {visible.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    index={index}
                    open={openId === task.id}
                    onToggleOpen={() => setOpenId(openId === task.id ? null : task.id)}
                    onToggleDone={() => toggleDone(task.id)}
                    onAsk={() => askAbout(task)}
                  />
                ))}
              </ul>
            </div>
          )}

          <p className="mt-8 text-sm text-muted">
            Civio gives general information from official sources. It is not legal, tax or insurance advice, and it does
            not estimate savings.
          </p>
        </div>
      </main>

      {/* ── Assistant: one panel, kept mounted so the conversation survives closing ── */}
      <div
        className={assistantOpen ? "fixed inset-0 z-40" : "hidden"}
        role="dialog"
        aria-modal="true"
        aria-label="Civio assistant"
      >
        <button
          type="button"
          aria-label="Close assistant"
          onClick={() => setAssistantOpen(false)}
          className="fade absolute inset-0 cursor-default bg-ink/40"
        />
        <div className="slide-in absolute inset-y-0 right-0 w-full max-w-md p-3">
          <AssistantPanel
            profile={profile}
            consent={profile.aiConsent === true}
            onConsentChange={setConsent}
            seed={seed}
            onClose={() => setAssistantOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
