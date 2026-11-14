"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LayoutGrid,
  MessageCircle,
  RotateCcw,
  UserRoundPen,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { Logo } from "@/components/Logo";
import { CATEGORY_SHORT, CategoryIcon, PriorityBadge, StatusBadge } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/format";
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

const MONEY_LABEL = { fee: "Fee", penalty: "Penalty risk", tax: "Tax", coverage: "Coverage gap" } as const;

const WIDE = "(min-width: 80rem)";

/** True when the assistant has its own column. Only one panel is ever mounted. */
function useIsWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

function dueText(task: PlanTask): { text: string; urgent: boolean } | null {
  if (!task.deadline) return null;
  if (!task.deadline.date) return { text: task.deadline.label, urgent: false };
  const days = daysUntil(task.deadline.date);
  const date = formatDate(task.deadline.date);
  if (days === null || task.displayStatus === "done") return { text: `Due ${date}`, urgent: false };
  if (days < 0) return { text: `Due ${date} · ${-days} ${days === -1 ? "day" : "days"} overdue`, urgent: true };
  if (days === 0) return { text: `Due today, ${date}`, urgent: true };
  return { text: `Due ${date} · in ${days} ${days === 1 ? "day" : "days"}`, urgent: days <= 14 };
}

function Stat({ label, value, tone = "ink" }: { label: string; value: number; tone?: "ink" | "moss" | "amber" | "oxblood" }) {
  const color = { ink: "text-ink", moss: "text-moss", amber: "text-amber", oxblood: "text-oxblood" }[tone];
  return (
    <div className="card px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-display text-4xl font-semibold tabular-nums ${color}`}>{value}</p>
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
    <li id={`row-${task.id}`} className="rise card overflow-hidden" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
      <div className="flex items-start gap-3 p-4 sm:items-center sm:p-5">
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-150 sm:size-9 ${
            done ? "border-moss bg-moss text-raised" : "border-taupe bg-raised text-transparent hover:border-moss"
          }`}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 flex-col gap-2 text-left sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="min-w-0 flex-1">
            <span className={`block font-semibold ${done ? "text-muted line-through decoration-taupe" : ""}`}>{task.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CategoryIcon category={task.category} className="size-3.5" />
                {CATEGORY_SHORT[task.category]}
              </span>
              {due && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={due.urgent ? "font-semibold text-oxblood" : ""}>{due.text}</span>
                </>
              )}
            </span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-1.5">
            {task.financial && !done && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted">
                <CircleDollarSign className="size-3.5" aria-hidden="true" />
                {MONEY_LABEL[task.financial.kind]}
              </span>
            )}
            {!done && <PriorityBadge priority={task.priority} />}
            <StatusBadge status={task.displayStatus} />
            <ChevronDown
              className={`size-5 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>
      </div>

      {open && (
        <div id={panelId} className="fade border-t border-line bg-surface px-4 py-5 sm:px-5">
          {task.verificationNote && task.displayStatus !== "done" && (
            <p className="mb-5 rounded-2xl bg-amber-wash px-4 py-3 text-sm text-amber">{task.verificationNote}</p>
          )}
          <p className="max-w-prose">{task.description}</p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mono-label text-muted">How to do it</h4>
              <ol className="mt-3 grid gap-2.5 text-sm">
                {task.steps.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-raised font-mono text-[0.6875rem] text-muted ring-1 ring-line">
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
                  <h4 className="mono-label mt-6 text-muted">Money impact</h4>
                  <p className="mt-3 text-sm">{task.financial.note}</p>
                </>
              )}
            </div>
          </div>

          {task.deadline?.date && (
            <p className="mt-6 text-sm text-muted">
              <span className="font-semibold text-ink">Deadline as the source words it:</span> {task.deadline.label}. The
              date above counts from your planned move date.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-raised px-4 py-3 ring-1 ring-line">
            <a
              href={task.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss underline-offset-4 hover:underline"
            >
              {task.source.name} <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
            <span className="font-mono text-xs text-muted">
              {task.status === "needs_verification" && task.verificationNote?.startsWith("Civio has no")
                ? "directory link, rule not verified"
                : `checked ${formatDate(task.source.lastVerified)}`}
              {task.source.effectiveDate ? ` · in effect since ${formatDate(task.source.effectiveDate)}` : ""}
            </span>
            <span className="font-mono text-xs text-muted sm:ml-auto">{task.ruleId}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onToggleDone} className="btn btn-primary">
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
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8" aria-busy="true" aria-label="Loading your plan">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-4 h-10 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="mt-8 grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
    </div>
  );
}

function NoPlan({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-oxblood-wash text-oxblood">
          <LayoutGrid className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">No plan yet</h1>
        <p className="mt-2 text-muted">Answer a few questions about your move and Civio builds your checklist.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/onboarding" className="btn btn-primary">
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const wide = useIsWide();

  // /dashboard?demo=1 loads the sample plan, then cleans the URL.
  useEffect(() => {
    if (!ready) return;
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      loadDemo();
      router.replace("/dashboard");
    }
  }, [ready, loadDemo, router]);

  useEffect(() => {
    if (!assistantOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAssistantOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assistantOpen]);

  const counts = useMemo(() => {
    const by = (c: Category) => tasks.filter((t) => t.category === c).length;
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.displayStatus === "done").length,
      review: tasks.filter((t) => t.displayStatus === "needs_verification").length,
      money: tasks.filter((t) => t.financial && t.displayStatus !== "done").length,
      category: { taxes: by("taxes"), health: by("health"), vehicle: by("vehicle"), family: by("family") },
    };
  }, [tasks]);

  const priorities = useMemo(() => tasks.filter((t) => t.displayStatus !== "done").slice(0, 3), [tasks]);

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (category === "all" || t.category === category) &&
          (status === "all" || t.displayStatus === status) &&
          (!moneyOnly || t.financial !== null),
      ),
    [tasks, category, status, moneyOnly],
  );

  if (!ready) return <Skeleton />;
  if (!hasPlan) return <NoPlan onDemo={loadDemo} />;

  const percent = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const filtered = category !== "all" || status !== "all" || moneyOnly;
  const clearFilters = () => {
    setCategory("all");
    setStatus("all");
    setMoneyOnly(false);
  };
  const askAbout = (task: PlanTask) => {
    setSeed({ text: `Explain this task in plain words: “${task.title}”. What should I do first?`, nonce: Date.now() });
    setAssistantOpen(true);
  };

  const navItem = (key: "all" | Category, label: string, count: number, icon: React.ReactNode) => {
    const active = category === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setCategory(key)}
        aria-pressed={active}
        className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[0.9375rem] transition-colors duration-150 ${
          active ? "bg-raised font-semibold shadow-card ring-1 ring-line" : "text-muted hover:text-ink"
        }`}
      >
        {icon}
        <span className="flex-1 whitespace-nowrap">{label}</span>
        <span className="font-mono text-xs tabular-nums">{count}</span>
      </button>
    );
  };

  const assistant = (onClose?: () => void) => (
    <AssistantPanel
      profile={profile}
      consent={profile.aiConsent === true}
      onConsentChange={setConsent}
      seed={seed}
      onClose={onClose}
    />
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_23rem]">
      {/* Sidebar */}
      <aside className="hidden border-r border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-dvh flex-col p-5">
          <Logo />
          <p className="mono-label mt-8 px-3 text-muted">Plan</p>
          <nav aria-label="Categories" className="mt-2 grid gap-1">
            {navItem("all", "All tasks", counts.total, <LayoutGrid className="size-4" strokeWidth={1.75} aria-hidden="true" />)}
            {CATEGORIES.map((c) => navItem(c, CATEGORY_LABEL[c], counts.category[c], <CategoryIcon category={c} />))}
          </nav>
          <div className="mt-auto grid gap-1 border-t border-line pt-4">
            <Link href="/onboarding" className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-[0.9375rem] text-muted hover:text-ink">
              <UserRoundPen className="size-4" strokeWidth={1.75} aria-hidden="true" /> Edit profile
            </Link>
            <button
              type="button"
              onClick={() => {
                reset();
                router.push("/");
              }}
              className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-left text-[0.9375rem] text-muted hover:text-ink"
            >
              <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" /> Start over
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 px-5 pb-28 pt-6 sm:px-8 lg:pt-8 xl:pb-10">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <Logo />
            <Link href="/onboarding" className="btn btn-quiet">
              <UserRoundPen className="size-4" aria-hidden="true" /> Profile
            </Link>
          </div>

          <p className="mono-label mt-6 text-muted lg:mt-0">Civio / My dashboard</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[clamp(1.875rem,3.4vw,2.75rem)] font-medium leading-tight tracking-[-0.03em]">
                Your moving plan
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-lg text-muted">
                {stateName(profile.currentState)} <ArrowRight className="size-4" aria-hidden="true" />{" "}
                {stateName(profile.destinationState)}
                {profile.moveDate && <span className="text-base">· moving {formatDate(profile.moveDate)}</span>}
                {isDemo && (
                  <span className="rounded-full bg-espresso px-2.5 py-0.5 text-xs font-semibold text-on-dark">Demo</span>
                )}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Tasks" value={counts.total} />
            <Stat label="Completed" value={counts.done} tone="moss" />
            <Stat label="To review" value={counts.review} tone="amber" />
            <Stat label="Money at stake" value={counts.money} tone="oxblood" />
          </div>

          {/* Priorities */}
          <section aria-labelledby="priorities" className="on-dark mt-3 rounded-panel bg-espresso p-5 text-on-dark sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="priorities" className="text-xl font-semibold tracking-tight">
                Your priorities
              </h2>
              <p className="text-sm text-dark-muted">
                {counts.done} of {counts.total} completed
              </p>
            </div>
            <div
              className="mt-4 h-2 rounded-full bg-espresso-raised"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Plan progress"
            >
              <div
                className="h-2 origin-left rounded-full bg-moss-fill transition-transform duration-500 ease-(--ease-out)"
                style={{ transform: `scaleX(${Math.max(percent, 2) / 100})` }}
              />
            </div>

            {priorities.length === 0 ? (
              <p className="mt-6 text-dark-muted">Everything is done. Nothing left on this plan.</p>
            ) : (
              <ul className="mt-5 grid gap-2">
                {priorities.map((task) => {
                  const due = dueText(task);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => {
                          clearFilters();
                          setOpenId(task.id);
                          requestAnimationFrame(() =>
                            document.getElementById(`row-${task.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
                          );
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl bg-espresso-raised px-4 py-3.5 text-left transition-colors duration-150 hover:bg-espresso-line"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-espresso-line text-dark-muted">
                          <CategoryIcon category={task.category} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{task.title}</span>
                          <span className="block truncate text-sm text-dark-muted">
                            {CATEGORY_SHORT[task.category]}
                            {due ? ` · ${due.text}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full border border-espresso-line px-2.5 py-1 text-xs font-semibold">
                          {task.displayStatus === "needs_verification" ? "To review" : task.priority === "high" ? "High" : "Pending"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Filters */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              {category === "all" ? "All tasks" : CATEGORY_LABEL[category]}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={status === s.value}
                  onClick={() => setStatus(s.value)}
                  className={`min-h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 ${
                    status === s.value ? "border-ink bg-ink text-surface" : "border-line bg-raised text-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={moneyOnly}
                onClick={() => setMoneyOnly((v) => !v)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 ${
                  moneyOnly ? "border-oxblood bg-oxblood text-on-oxblood" : "border-line bg-raised text-muted"
                }`}
              >
                <CircleDollarSign className="size-4" aria-hidden="true" /> Money
              </button>
            </div>
          </div>

          {/* Category chips on small screens, where the sidebar is hidden */}
          <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1 lg:hidden" role="group" aria-label="Filter by category">
            {(["all", ...CATEGORIES] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${
                  category === c ? "border-oxblood bg-oxblood-wash text-oxblood" : "border-line bg-raised text-muted"
                }`}
              >
                {c === "all" ? "All" : CATEGORY_SHORT[c]}
              </button>
            ))}
          </div>

          {/* Tasks */}
          {visible.length === 0 ? (
            <div className="card mt-4 p-8 text-center">
              <p className="font-semibold">No tasks match these filters</p>
              <p className="mt-1 text-sm text-muted">
                {filtered ? "Try a different status or category." : "The rules found nothing for this profile."}
              </p>
              {filtered && (
                <button type="button" onClick={clearFilters} className="btn btn-quiet mt-4">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-2.5" key={`${category}-${status}-${moneyOnly}`}>
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
          )}

          <p className="mt-8 text-sm text-muted">
            Civio gives general information from official sources. It is not legal, tax or insurance advice, and it does
            not estimate savings.
          </p>
        </div>
      </main>

      {/* Assistant: a column on wide screens */}
      {wide && (
        <aside className="p-4 pl-0">
          <div className="sticky top-4 h-[calc(100dvh-2rem)]">{assistant()}</div>
        </aside>
      )}

      {/* Assistant: a slide-over elsewhere */}
      {!wide && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="btn btn-primary fixed bottom-5 right-5 z-30 shadow-lift"
        >
          <MessageCircle className="size-4" aria-hidden="true" /> Ask Civio
        </button>
      )}
      {!wide && assistantOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Civio assistant">
          <button
            type="button"
            aria-label="Close assistant"
            onClick={() => setAssistantOpen(false)}
            className="fade absolute inset-0 cursor-default bg-espresso/50"
          />
          <div className="slide-in absolute inset-y-0 right-0 w-full max-w-md p-3">{assistant(() => setAssistantOpen(false))}</div>
        </div>
      )}
    </div>
  );
}
