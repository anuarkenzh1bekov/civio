import { ArrowRight, ArrowUpRight, FileText, MessageCircle } from "lucide-react";
import Link from "next/link";
import { LiveEngine } from "@/components/landing/LiveEngine";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { CATEGORY_SHORT, CategoryIcon } from "@/components/ui";
import { DEMO_PROFILE } from "@/lib/demo";
import { formatDate, formatShortDate } from "@/lib/format";
import { RULES, ruleById } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";

const plan = generatePlan(DEMO_PROFILE, RULES);
const dated = plan.filter((t) => t.deadline?.date).slice(0, 3);
const anatomy = plan.find((t) => t.id === "CA-VEH-REG");

function days(ruleId: string): number {
  return ruleById(ruleId)?.task_template.deadline?.daysAfterMove ?? 0;
}

/** Real deadlines from the rule base: the same errand, two states, different clocks. */
const CLOCKS = [
  { errand: "Register your car", rows: [{ state: "California", days: days("CA-VEH-REG") }, { state: "Texas", days: days("TX-VEH-REG") }] },
  { errand: "Swap your driver license", rows: [{ state: "California", days: days("CA-VEH-DL") }, { state: "Texas", days: days("TX-VEH-DL") }] },
];
const LONGEST = Math.max(...CLOCKS.flatMap((c) => c.rows.map((r) => r.days)));

function RouteLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 520"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 hidden h-full w-full text-line md:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <path d="M0 400h90a18 18 0 0 0 18-18V250" />
      <path d="M1200 120h-210a18 18 0 0 0-18 18v60" />
      <path d="M1200 430h-120a18 18 0 0 1-18-18V300a18 18 0 0 0-18-18h-60" />
      <path d="M520 0v46a18 18 0 0 0 18 18h260a18 18 0 0 1 18 18v40" />
      <rect x="98" y="238" width="20" height="20" rx="5" fill="var(--color-paper)" />
      <rect x="962" y="110" width="20" height="20" rx="5" fill="var(--color-paper)" />
      <rect x="1052" y="290" width="20" height="20" rx="5" fill="var(--color-paper)" />
    </svg>
  );
}

function PlanCard() {
  return (
    <div className="on-dark rounded-panel bg-espresso p-5 text-on-dark shadow-lift sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="mono-label text-dark-muted">Your moving plan</p>
          <p className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Texas <ArrowRight className="size-5 text-dark-muted" aria-hidden="true" /> California
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-semibold tabular-nums">{plan.length}</p>
          <p className="text-xs text-dark-muted">tasks</p>
        </div>
      </div>

      <ul className="mt-6 grid gap-2">
        {dated.map((task) => (
          <li key={task.id} className="flex items-center gap-3 rounded-2xl bg-espresso-raised px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-espresso-line text-dark-muted">
              <CategoryIcon category={task.category} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-medium">{task.title}</span>
              <span className="block text-xs text-dark-muted">{CATEGORY_SHORT[task.category]}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-sm tabular-nums">{formatShortDate(task.deadline?.date)}</span>
              <span className="block text-xs text-dark-muted">due</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-dark-muted">
        Dates count from a move on {formatDate(DEMO_PROFILE.moveDate)}. Demo data.
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main>
      {/* ── Hook ── */}
      <section className="relative">
        <RouteLines />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <header className="flex items-center justify-between py-5">
            <Logo />
            <nav aria-label="Primary" className="flex items-center gap-2">
              <Link href="/dashboard?demo=1" className="btn btn-quiet hidden sm:inline-flex">
                Open demo
              </Link>
              <Link href="/onboarding" className="btn btn-primary">
                Get Started
              </Link>
            </nav>
          </header>

          <Reveal immediate className="grid items-center gap-10 pb-16 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:pb-28 lg:pt-20">
            <div>
              <p data-reveal className="mono-label text-muted">
                Taxes · Insurance · Vehicle · School
              </p>
              <h1
                data-reveal
                className="mt-5 text-[clamp(2.375rem,4.5vw,3.75rem)] font-medium leading-[1.04] tracking-[-0.035em]"
              >
                Life gets complicated. <span className="text-taupe lg:block">Civio makes it simple.</span>
              </h1>
              <p data-reveal className="mt-6 max-w-md text-lg text-muted">
                Manage taxes, insurance, paperwork, and life changes — all in one place.
              </p>
              <div data-reveal className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/onboarding" className="btn btn-primary">
                  Get Started <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link href="/dashboard?demo=1" className="btn btn-quiet">
                  See a sample plan
                </Link>
              </div>
            </div>
            <div data-reveal className="relative">
              <PlanCard />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="on-dark bg-espresso text-on-dark">
        <Reveal className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
          <h2
            data-reveal
            className="max-w-3xl text-[clamp(1.875rem,3.6vw,2.875rem)] font-medium leading-[1.1] tracking-[-0.03em]"
          >
            One move resets your paperwork.{" "}
            <span className="text-dark-muted">And every state runs a different clock.</span>
          </h2>

          <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-16">
            {CLOCKS.map((clock) => (
              <div key={clock.errand} data-reveal>
                <p className="mono-label text-dark-muted">{clock.errand}</p>
                <div className="mt-5 grid gap-5">
                  {clock.rows.map((row) => (
                    <div key={row.state}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[0.9375rem]">{row.state}</span>
                        <span className="font-display text-3xl font-semibold tabular-nums">
                          {row.days} <span className="text-base font-normal text-dark-muted">days</span>
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-espresso-raised">
                        <div
                          className="h-2 rounded-full bg-moss-fill"
                          style={{ width: `${Math.max(4, (row.days / LONGEST) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p data-reveal className="mt-10 max-w-xl text-sm text-dark-muted">
            Time a new resident has after moving, as published by the California DMV and the Texas DMV. Miss one and
            the state adds late fees.
          </p>
        </Reveal>
      </section>

      {/* ── Solution: the engine itself ── */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
        <Reveal>
          <h2
            data-reveal
            className="max-w-2xl text-[clamp(1.875rem,3.6vw,2.875rem)] font-medium leading-[1.1] tracking-[-0.03em]"
          >
            Change one answer. <span className="text-taupe">Watch the whole plan follow.</span>
          </h2>
          <p data-reveal className="mt-5 max-w-xl text-lg text-muted">
            This is Civio's rule engine running live. Try it.
          </p>
          <div data-reveal className="mt-12">
            <LiveEngine />
          </div>
        </Reveal>
      </section>

      {/* ── Proof: where a task comes from ── */}
      <section className="border-y border-line bg-surface">
        <Reveal className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-16 lg:py-32">
          <div>
            <h2
              data-reveal
              className="text-[clamp(1.875rem,3.6vw,2.875rem)] font-medium leading-[1.1] tracking-[-0.03em]"
            >
              Rules decide. <span className="text-taupe">AI explains.</span>
            </h2>
            <p data-reveal className="mt-5 text-lg text-muted">
              Every deadline comes from a rule copied from an official source, with the link and the date it was
              checked. The assistant can put it in plain words. It cannot invent one.
            </p>
            <dl data-reveal className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-6">
              <div>
                <dt className="text-sm text-muted">Rules in the base</dt>
                <dd className="font-display text-4xl font-semibold tabular-nums">{RULES.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Flagged, not guessed</dt>
                <dd className="font-display text-4xl font-semibold tabular-nums">
                  {RULES.filter((r) => !r.verified).length}
                </dd>
              </div>
            </dl>
          </div>

          {anatomy && (
            <div data-reveal className="card p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
                  <CategoryIcon category={anatomy.category} className="size-3.5" /> Vehicle
                </span>
                <span className="rounded-full bg-oxblood-wash px-2.5 py-1 text-xs font-semibold text-oxblood">High</span>
                <span className="ml-auto font-mono text-xs text-muted">{anatomy.ruleId}</span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">{anatomy.title}</h3>
              <p className="mt-2 text-muted">{anatomy.deadline?.label}</p>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mono-label text-muted">Documents</p>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {anatomy.documents.slice(0, 4).map((doc) => (
                      <li key={doc} className="flex items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0 text-taupe" aria-hidden="true" strokeWidth={1.75} />
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mono-label text-muted">Money impact</p>
                  <p className="mt-3 text-sm">{anatomy.financial?.note}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-moss-wash px-4 py-3">
                <a
                  href={anatomy.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss underline-offset-4 hover:underline"
                >
                  {anatomy.source.name} <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
                <span className="font-mono text-xs text-moss">checked {formatDate(anatomy.source.lastVerified)}</span>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line px-4 py-3">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-oxblood" aria-hidden="true" strokeWidth={1.75} />
                <p className="text-sm text-muted">
                  <span className="font-semibold text-ink">Ask Civio:</span> “What if my smog check isn't done in
                  time?”
                </p>
              </div>
            </div>
          )}
        </Reveal>
      </section>

      {/* ── Close ── */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
        <Reveal className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
          <h2
            data-reveal
            className="max-w-2xl text-[clamp(1.875rem,3.6vw,2.875rem)] font-medium leading-[1.1] tracking-[-0.03em]"
          >
            Twelve questions. <span className="text-taupe">Then you know what's due, and when.</span>
          </h2>
          <div data-reveal className="flex flex-wrap gap-3">
            <Link href="/onboarding" className="btn btn-primary">
              Get Started <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <p className="max-w-xl sm:text-right">
            Civio gives general information from official sources. It is not legal, tax or insurance advice.
          </p>
        </div>
      </footer>
    </main>
  );
}
