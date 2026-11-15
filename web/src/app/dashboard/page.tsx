import "./budget.css";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { useToast } from "@astryxdesign/core/Toast";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { createStaticSource, type SearchableItem } from "@astryxdesign/core/Typeahead";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LayoutGrid,
  Lock,
  MessageCircle,
  PlaneLanding,
  ScrollText,
  Search,
} from "lucide-react";
import Link from "@/components/Link";
import { useRouter, useSearchParams } from "@/lib/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrivalBanner } from "@/components/dashboard/ArrivalBanner";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { ContinueLink } from "@/components/dashboard/ContinueLink";
import { CostCalculator } from "@/components/dashboard/CostCalculator";
import { BudgetEditor } from "@/components/dashboard/BudgetEditor";
import { PlanFolders } from "@/components/dashboard/PlanFolders";
import { PlanHeader } from "@/components/dashboard/PlanHeader";
import { RouteBanner } from "@/components/dashboard/RouteBanner";
import { CATEGORY_SHORT, CategoryIcon, PriorityBadge, StatusBadge } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/format";
import { adoptSession, useCivio, type PlanTask } from "@/lib/store";
import { difference } from "@/lib/budget";
import { folderCost } from "@/lib/forecast/model";
import { money } from "@/lib/forecast/conversation";
import { CATEGORY_LABEL, type Category, type TaskStatus } from "@/lib/types";

const CATEGORIES: Category[] = ["taxes", "health", "vehicle", "family"];
const STATUSES: { value: "all" | TaskStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "needs_verification", label: "To review" },
  { value: "done", label: "Done" },
];

const MONEY_LABEL = { fee: "Fee", penalty: "Penalty risk", tax: "Tax", coverage: "Coverage gap" } as const;

function dueText(task: PlanTask): { text: string; urgent: boolean } | null {
  if (!task.deadline) return null;
  if (!task.deadline.date) return { text: task.deadline.label, urgent: false };
  const days = daysUntil(task.deadline.date);
  const date = `Est. ${formatDate(task.deadline.date)}`;
  if (days === null || task.displayStatus === "done") return { text: date, urgent: false };
  if (days < 0) return { text: `${date} · ${-days} ${days === -1 ? "day" : "days"} past estimate`, urgent: true };
  if (days === 0) return { text: `Today, ${date}`, urgent: true };
  return { text: `${date} · in ${days} ${days === 1 ? "day" : "days"}`, urgent: days <= 14 };
}

function TaskRow({
  task,
  index,
  showCategory,
  open,
  arrived,
  onToggleOpen,
  onToggleDone,
  onAsk,
}: {
  task: PlanTask;
  index: number;
  showCategory: boolean;
  open: boolean;
  arrived: boolean;
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
      className="rise border-t border-line first:border-t-0"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <div className="flex items-start gap-3 px-4 py-3.5 md:items-center md:px-5">
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-150 md:size-7 ${
            done ? "border-ok bg-ok text-card" : "border-ink-faint bg-card text-transparent hover:border-ok"
          }`}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="task-details-toggle grid min-w-0 flex-1 gap-2 text-left md:items-center md:gap-4"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`min-w-0 font-medium leading-snug ${done ? "text-ink-muted line-through decoration-ink-faint" : ""}`}>
              {task.title}
            </span>
            {!done && <PriorityBadge priority={task.priority} />}
            {!done && task.waitingOn.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-ink-muted">
                <Lock className="size-3" aria-hidden="true" /> After {task.waitingOn.length === 1 ? "1 task" : `${task.waitingOn.length} tasks`}
              </span>
            )}
          </span>
          {showCategory && <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <CategoryIcon category={task.category} className="size-4" />
            {CATEGORY_SHORT[task.category]}
          </span>}
          <span className={`text-sm leading-snug ${due?.urgent ? "font-semibold text-risk" : "text-ink-muted"}`}>
            {due ? due.text : "No deadline recorded"}
          </span>
          <span>
            {task.displayStatus === "needs_verification" && task.verificationNote ? (
              <Tooltip content={task.verificationNote}>
                <span className="inline-flex">
                  <StatusBadge status={task.displayStatus} />
                </span>
              </Tooltip>
            ) : (
              <StatusBadge status={task.displayStatus} />
            )}
          </span>
          <ChevronDown
            className={`hidden size-5 text-ink-muted transition-transform duration-200 md:block ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div id={panelId} className="fade border-t border-line bg-panel/60 px-4 py-5 md:px-5">
          {task.verificationNote && !done && (
            <p className="mb-5 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">{task.verificationNote}</p>
          )}
          {!done && task.waitingOn.length > 0 && (
            <p className="mb-5 flex gap-2.5 rounded-2xl bg-card px-4 py-3 text-sm ring-1 ring-line">
              <Lock className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span>
                <span className="font-semibold">Do this first:</span> {task.waitingOn.join("; ")}.
              </span>
            </p>
          )}
          <p className="max-w-prose">{task.description}</p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mono-label text-ink-muted">How to do it</h4>
              <ol className="mt-3 grid gap-2.5 text-sm">
                {task.steps.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-card font-mono text-[0.6875rem] text-ink-muted ring-1 ring-line">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h4 className="mono-label text-ink-muted">Documents</h4>
              <ul className="mt-3 grid gap-2.5 text-sm">
                {task.documents.map((doc) => (
                  <li key={doc} className="flex gap-2.5">
                    <FileText className="mt-0.5 size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
                    {doc}
                  </li>
                ))}
              </ul>
              {task.financial && (
                <>
                  <h4 className="mono-label mt-6 text-ink-muted">Money impact · {MONEY_LABEL[task.financial.kind]}</h4>
                  <p className="mt-3 text-sm">{task.financial.note}</p>
                </>
              )}
            </div>
          </div>

          {task.deadline?.date && (
            <p className="mt-6 text-sm text-ink-muted">
              <span className="font-semibold text-ink">Deadline as the source words it:</span> {task.deadline.label}. The
              date counts from {arrived ? "the day you arrived" : "your planned move date"}.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
            <a
              href={task.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"
            >
              {task.source.name} <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
            <span className="font-mono text-xs text-ink-muted">
              {task.verificationNote?.startsWith("Civio has no")
                ? "directory link, rule not verified"
                : `checked ${formatDate(task.source.lastVerified)}`}
              {task.source.effectiveDate ? ` · in effect since ${formatDate(task.source.effectiveDate)}` : ""}
            </span>
            <span className="font-mono text-xs text-ink-muted sm:ml-auto">{task.ruleId}</span>
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
    <div className="min-h-dvh bg-panel px-5 py-10 sm:px-8" aria-busy="true" aria-label="Loading your plan">
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

function NoPlan({ linkError = false }: { linkError?: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-panel px-5">
      <div className="tile max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-panel text-ink">
          <LayoutGrid className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{linkError ? "That link didn't open a plan" : "No plan yet"}</h1>
        <p className="mt-2 text-ink-muted">
          {linkError
            ? "The plan may have been started on a different server, or the link is incomplete. You can start a new one here."
            : "Compare your budget before and after a move, then build your checklist."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 max-sm:grid">
          <Link href="/onboarding" className="btn btn-primary">
            Get Started <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/dashboard?demo=1" className="btn btn-quiet">View sample budget</Link>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<Skeleton />}><DashboardRoute /></Suspense>;
}

function DashboardRoute() {
  const params = useSearchParams();
  const preview = params.get("demo") === "1";
  return <Dashboard key={String(preview)} preview={preview} panel={params.get("panel")} />;
}

function Dashboard({ preview, panel }: { preview: boolean; panel: string | null }) {
  const router = useRouter();
  const { ready, planFailed, sid, hasPlan, isDemo, profile, tasks, costs, toggleDone, setConsent, saveBudget, setArrived, setCost, reset } =
    useCivio(preview);
  const [category, setCategory] = useState<"all" | Category>("all");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [moneyOnly, setMoneyOnly] = useState(false);
  const [arrivalOnly, setArrivalOnly] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const showToast = useToast();
  const [checklistOpen, setChecklistOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#folders" && window.matchMedia("(max-width: 650px)").matches) setChecklistOpen(true);
  }, []);

  // /dashboard?s=<id> opens a plan started on another device, then drops the id from the URL.
  useEffect(() => {
    if (preview || !ready) return;
    const shared = new URLSearchParams(window.location.search).get("s");
    if (!shared) return;
    void adoptSession(shared).then((ok) => {
      setLinkError(!ok);
      router.replace("/dashboard");
    });
  }, [preview, ready, router]);

  useEffect(() => {
    if (panel === "ask") setAssistantOpen(true);
    if (panel === "search") setPaletteOpen(true);
  }, [panel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const completed = tasks.filter(task => task.displayStatus === "done").length;
  const next = tasks.find(task => task.displayStatus === "pending");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // The arrival checklist is every task on a countdown plus whatever those tasks wait on.
    const arrival = new Set<string>();
    for (const t of tasks) {
      if (t.daysAfterMove === undefined) continue;
      arrival.add(t.id);
      for (const id of t.dependsOn) arrival.add(id);
    }
    return tasks.filter(
      (t) =>
        (category === "all" || t.category === category) &&
        (status === "all" || t.displayStatus === status) &&
        (!moneyOnly || t.financial !== null) &&
        (!arrivalOnly || arrival.has(t.id)) &&
        (!needle || `${t.title} ${t.description} ${CATEGORY_LABEL[t.category]}`.toLowerCase().includes(needle)),
    );
  }, [tasks, category, status, moneyOnly, arrivalOnly, query]);

  const commands = useMemo(() => {
    const items: SearchableItem<{ group: string }>[] = [
      { id: "action:ask", label: "Ask Civio a question", auxiliaryData: { group: "Actions" } },
      { id: "action:profile", label: "Edit profile", auxiliaryData: { group: "Actions" } },
      { id: "action:money", label: "Show tasks with money at stake", auxiliaryData: { group: "Actions" } },
      { id: "action:review", label: "Show tasks to review", auxiliaryData: { group: "Actions" } },
      { id: "action:documents", label: "Open documents: who to notify and letters", auxiliaryData: { group: "Actions" } },
      { id: "action:costs", label: "Go to the cost calculator", auxiliaryData: { group: "Actions" } },
      ...tasks.map((t) => ({ id: `task:${t.id}`, label: t.title, auxiliaryData: { group: CATEGORY_LABEL[t.category] } })),
    ];
    return createStaticSource(items);
  }, [tasks]);

  if (!ready) return <Skeleton />;
  if (!hasPlan) return <NoPlan linkError={linkError} />;

  const documentsHref = preview ? "/documents?demo=1" : "/documents";
  const filtered = category !== "all" || status !== "all" || moneyOnly || arrivalOnly || query.trim() !== "";
  const clearFilters = () => {
    setCategory("all");
    setStatus("all");
    setMoneyOnly(false);
    setArrivalOnly(false);
    setQuery("");
  };
  const focusChecklist = () => {
    requestAnimationFrame(() => {
      const title = document.getElementById("checklist-title");
      title?.focus({ preventScroll: true });
      title?.scrollIntoView({ block: "start" });
    });
  };
  const openFolder = (folder: Category | "all") => {
    clearFilters();
    setCategory(folder);
    setOpenId(null);
    setChecklistOpen(true);
    focusChecklist();
  };
  const reveal = (taskId: string) => {
    clearFilters();
    setChecklistOpen(true);
    setOpenId(taskId);
    requestAnimationFrame(() => {
      const phone = window.matchMedia("(max-width: 650px)").matches;
      document.getElementById(`row-${taskId}`)?.scrollIntoView(phone
        ? { block: "start" } : { behavior: "smooth", block: "center" });
    });
  };
  /** Mark a task done or not done, with a toast that can undo it. */
  const toggleWithUndo = (task: PlanTask) => {
    const wasDone = task.displayStatus === "done";
    toggleDone(task.id);
    const dismiss = showToast({
      uniqueID: `done-${task.id}`,
      body: wasDone ? `“${task.title}” is open again` : `“${task.title}” marked as done`,
      endContent: (
        <button
          type="button"
          className="rounded-full px-3 py-1 text-sm font-semibold underline underline-offset-4"
          onClick={() => {
            toggleDone(task.id);
            dismiss();
          }}
        >
          Undo
        </button>
      ),
    });
  };
  const runCommand = (id: string) => {
    if (id === "action:ask") setAssistantOpen(true);
    else if (id === "action:profile") router.push("/onboarding");
    else if (id === "action:documents") router.push(documentsHref);
    else if (id === "action:costs") document.getElementById("costs")?.scrollIntoView({ behavior: "smooth" });
    else if (id === "action:money" || id === "action:review") {
      clearFilters();
      setChecklistOpen(true);
      if (id === "action:money") setMoneyOnly(true);
      else setStatus("needs_verification");
      if (window.matchMedia("(max-width: 650px)").matches) focusChecklist();
    } else if (id.startsWith("task:")) reveal(id.slice(5));
  };
  const categoryCost = profile.forecast && category !== "all" ? folderCost(profile.forecast, category) : null;
  const askAbout = (task: PlanTask) => {
    setSeed({ text: `Explain this task in plain words: “${task.title}”. What should I do first?`, nonce: Date.now() });
    setAssistantOpen(true);
  };

  return (
    <div className="move-workspace min-h-dvh bg-canvas">
      <PlanHeader preview={preview} onSearch={() => setPaletteOpen(true)} onAsk={() => setAssistantOpen(true)}
        onChecklist={() => setChecklistOpen(true)} />
      <main className="ledger-shell plan-layout pb-24">
        <PlanFolders categories={CATEGORIES} tasks={tasks} selected={checklistOpen ? category : "all"} onSelect={openFolder} />
        <RouteBanner profile={profile} sample={isDemo} />
        {planFailed && (
          <p role="alert" className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            Your checklist could not be loaded. Check your connection and reload the page. Your budget is unaffected.
          </p>
        )}
        {linkError && (
          <p role="alert" className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            That link didn't open a plan, so this is still the plan saved in this browser.
          </p>
        )}
        <ArrivalBanner
          profile={profile}
          auto={!preview}
          onArrived={(date) => {
            setArrived(date);
            setArrivalOnly(true);
            setChecklistOpen(true);
          }}
          onUndo={() => {
            setArrived(undefined);
            setArrivalOnly(false);
          }}
        />
        <BudgetEditor
          profile={profile}
          sample={isDemo}
          onSave={saveBudget}
          onChecklist={() => openFolder("all")}
        />
        <section className="destination-invite" aria-labelledby="destination-invite-title">
          <div>
            <p className="mono-label text-ink-muted">Still deciding?</p>
            <h2 id="destination-invite-title">Compare a few destinations</h2>
            <p>See your monthly and first-year budget estimates side by side.</p>
          </div>
          <Link className="btn btn-quiet" href="/compare">
            Compare options <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
        <section className="ledger-checklist" id="folders" aria-label="Moving checklist">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Moving checklist</h2>
            <button className="ledger-link" type="button" aria-expanded={checklistOpen} aria-controls="checklist-content" onClick={() => setChecklistOpen(!checklistOpen)}>
              {checklistOpen ? "Hide checklist" : "View checklist"} · {completed}/{tasks.length} done
            </button>
          </div>
          {next && <button className="ledger-next" type="button" onClick={() => reveal(next.id)}>
            <span>Next step</span><strong>{next.title}</strong><small>{dueText(next)?.text}</small><ArrowRight className="size-4" />
          </button>}
          <div id="checklist-content" hidden={!checklistOpen}>
          {/* Tasks */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h2 id="checklist-title" tabIndex={-1} className="text-xl font-semibold tracking-tight">
              {category === "all" ? "Tasks" : CATEGORY_LABEL[category]}
            </h2>
            <div className="folder-filters" role="group" aria-label="Filter tasks">
              <div className="status-switch" role="group" aria-label="Filter by status">
                {STATUSES.map((s) => (
                  <button key={s.value} type="button" aria-pressed={status === s.value} onClick={() => setStatus(s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={arrivalOnly}
                onClick={() => setArrivalOnly((v) => !v)}
                className="folder-filter"
              >
                <PlaneLanding className="size-4" aria-hidden="true" /> On arrival
              </button>
              <button
                type="button"
                aria-pressed={moneyOnly}
                onClick={() => setMoneyOnly((v) => !v)}
                className="folder-filter"
              >
                <CircleDollarSign className="size-4" aria-hidden="true" /> Money
              </button>
            </div>
          </div>

          {categoryCost && <div className="folder-budget">
            <div className="folder-budget-total">
              <p>{categoryCost.label}</p>
              <strong>{difference((categoryCost.after - categoryCost.before) * 100)}{categoryCost.after !== categoryCost.before && <small> / mo</small>}</strong>
            </div>
            <dl aria-label="Estimated monthly costs">
              <div><dt>{profile.currentState}</dt><dd>{money(categoryCost.before)}</dd></div>
              <div><dt>{profile.destinationState}</dt><dd>{money(categoryCost.after)}</dd></div>
            </dl>
            <p className="folder-budget-note">{category === "taxes" ? "Monthly estimate based on the salary in your forecast." : "Monthly estimate for your household size, included in your budget."}</p>
          </div>}
          <div className="mt-3 flex flex-wrap gap-3">
            <select aria-label="Task category" className="rounded-lg border border-line bg-card px-3 py-2" value={category} onChange={e => setCategory(e.target.value as typeof category)}>
              <option value="all">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <label className="flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-line bg-card px-3 focus-within:outline-2 focus-within:outline-brand">
              <Search className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="sr-only">Search tasks</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks…"
                className="min-w-0 flex-1 bg-transparent text-base placeholder:text-ink-muted focus-visible:outline-none"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="tile mt-4 p-8 text-center">
              <p className="font-semibold">No tasks match</p>
              <p className="mt-1 text-sm text-ink-muted">
                {filtered ? "Try a different search, status or module." : "The rules found nothing for this profile."}
              </p>
              {filtered && (
                <button type="button" onClick={clearFilters} className="btn btn-quiet mt-4">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="task-table tile mt-4 overflow-hidden" data-all-categories={category === "all"}>
              <div className="task-column-labels hidden items-center gap-4 border-b border-line bg-panel px-5 py-3 text-xs font-medium text-ink-muted md:grid">
                <span />
                <span className="-ml-1">Task</span>
                {category === "all" && <span>Folder</span>}
                <span>Due</span>
                <span>Status</span>
                <span />
              </div>
              <ul key={`${category}-${status}-${moneyOnly}-${arrivalOnly}`}>
                {visible.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    index={index}
                    showCategory={category === "all"}
                    open={openId === task.id}
                    arrived={Boolean(profile.arrivedOn)}
                    onToggleOpen={() => setOpenId(openId === task.id ? null : task.id)}
                    onToggleDone={() => toggleWithUndo(task)}
                    onAsk={() => askAbout(task)}
                  />
                ))}
              </ul>
            </div>
          )}

          </div>
        </section>

        <CostCalculator tasks={tasks} amounts={costs} onChange={setCost} />

        <Link
          href={documentsHref}
          className="tile mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 p-6 transition-colors duration-150 hover:bg-card/70"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-panel">
            <ScrollText className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 basis-64">
            <span className="block font-display text-xl font-semibold tracking-tight">Documents for this move</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              Who to notify, built from your profile, and letters ready to send: change of address, move-out notice and more.
            </span>
          </span>
          <span className="btn btn-primary">
            Open <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>

        {!preview && (
          <div className="mt-8 max-w-sm">
            <ContinueLink sid={sid} />
          </div>
        )}
        {!preview && <button type="button" className="ledger-reset mt-6 text-sm text-ink-muted" onClick={() => setConfirmReset(true)}>Start over</button>}
      </main>

      {!assistantOpen && (
        <button
          type="button"
          className="ask-civio-fab"
          onClick={() => setAssistantOpen(true)}
          aria-label="Ask Civio"
          title="Questions about your move? Ask Civio."
        >
          <MessageCircle aria-hidden="true" />
        </button>
      )}

      {/* ── Assistant in an Astryx drawer: focus handling, Escape and scrim come with it ── */}
      <Drawer className="plan-assistant" isOpen={assistantOpen} onOpenChange={setAssistantOpen} label="Civio assistant" side="end" width={440}>
        <div className="flex h-full min-h-0 flex-col">
          <DrawerHeader
            title="Ask Civio"
            subtitle="Explains your rules. Doesn't set deadlines."
            onOpenChange={setAssistantOpen}
          />
          <div className="min-h-0 flex-1">
            <AssistantPanel
              profile={profile}
              consent={profile.aiConsent === true}
              onConsentChange={setConsent}
              seed={seed}
            />
          </div>
        </div>
      </Drawer>

      <CommandPalette
        isOpen={paletteOpen}
        onOpenChange={setPaletteOpen}
        searchSource={commands}
        label="Search tasks and actions"
        value=""
        onValueChange={(id) => {
          if (id) runCommand(id);
        }}
        emptySearchText="No task or action matches."
      />

      <AlertDialog
        isOpen={confirmReset}
        onOpenChange={setConfirmReset}
        title="Start over?"
        description="This clears your answers and task progress from this browser. It cannot be undone."
        actionLabel="Clear my plan"
        onAction={() => {
          setConfirmReset(false);
          reset();
          router.push("/");
        }}
      />
    </div>
  );
}
