import { ArrowRight, ArrowUpRight, Check, FileText, MessageCircle } from "lucide-react";
import Link from "next/link";
import { LiveEngine } from "@/components/landing/LiveEngine";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { CATEGORY_SHORT, CategoryIcon } from "@/components/ui";
import { DEMO_DONE, DEMO_PROFILE } from "@/lib/demo";
import { formatDate, formatShortDate } from "@/lib/format";
import { RULES, ruleById } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";
import type { Category } from "@/lib/types";

const plan = generatePlan(DEMO_PROFILE, RULES);
const dated = plan.filter((t) => t.deadline?.date).slice(0, 3);
const first = dated[0];
const anatomy = plan.find((t) => t.id === "CA-VEH-REG");
const verifiedCount = RULES.filter((r) => r.verified).length;
const donePercent = Math.round((DEMO_DONE.length / plan.length) * 100);

function days(ruleId: string): number {
  return ruleById(ruleId)?.task_template.deadline?.daysAfterMove ?? 0;
}

/** Real deadlines from the rule base: the same errand, two states, different clocks. */
const CLOCKS = [
  { errand: "Register your car", rows: [{ state: "California", days: days("CA-VEH-REG") }, { state: "Texas", days: days("TX-VEH-REG") }] },
  { errand: "Swap your driver license", rows: [{ state: "California", days: days("CA-VEH-DL") }, { state: "Texas", days: days("TX-VEH-DL") }] },
];
/** Pricing. The free plan is the whole rule engine; paid plans add generated documents and re-checks. */
const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "always",
    blurb: "The full plan for one move.",
    features: ["Personal checklist with deadlines and sources", "Assistant that explains each rule", "Cost calculator", "Who-to-notify list"],
    cta: { label: "Get Started", href: "/onboarding" },
    featured: false,
    note: null,
  },
  {
    name: "Move Pack",
    price: "$19",
    cadence: "one payment per move",
    blurb: "The paperwork, written for you.",
    features: ["Change of address, move-out and insurer letters", "Filled from your profile, tailored by AI", "Copy, download or print", "School records request when you have children"],
    cta: { label: "See the documents", href: "/documents" },
    featured: true,
    note: "Demo checkout in this build. Nothing is charged.",
  },
  {
    name: "Civio Watch",
    price: "$5",
    cadence: "per month",
    blurb: "For people who move again.",
    features: ["Every plan kept and reusable for the next move", "Notice when a rule in your plan is re-checked and changes", "Deadline reminders by email"],
    cta: null,
    featured: false,
    note: "Planned. Not available yet.",
  },
] as const;

const LONGEST = Math.max(...CLOCKS.flatMap((c) => c.rows.map((r) => r.days)));

const MODULES: { category: Category; label: string; className: string }[] = [
  { category: "taxes", label: "Taxes", className: "left-6 top-[14%]" },
  { category: "health", label: "Health insurance", className: "right-0 top-[30%]" },
  { category: "vehicle", label: "Vehicle", className: "left-0 bottom-[22%]" },
  { category: "family", label: "School", className: "right-10 bottom-[10%]" },
];

/** The one hero visual: a glass plan card with the four modules pinned around it. */
function HeroVisual() {
  return (
    <div className="relative mx-auto mt-10 w-full max-w-5xl">
      {MODULES.map((m) => (
        <span
          key={m.category}
          className={`glass absolute hidden items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-white lg:inline-flex ${m.className}`}
        >
          <CategoryIcon category={m.category} className="size-4" />
          {m.label}
        </span>
      ))}
      <div className="glass mx-auto max-w-xl rounded-panel p-4 text-white shadow-lift sm:p-5">
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Texas <ArrowRight className="size-4 opacity-70" aria-hidden="true" /> California
          </p>
          <p className="font-mono text-xs opacity-80">{plan.length} tasks</p>
        </div>
        <ul className="mt-4 grid gap-2">
          {dated.map((task) => (
            <li key={task.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-ink">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-moss-wash text-moss">
                <CategoryIcon category={task.category} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold">{task.title}</span>
                <span className="block text-xs text-muted">{CATEGORY_SHORT[task.category]}</span>
              </span>
              <span className="shrink-0 rounded-full bg-oxblood-wash px-2.5 py-1 font-mono text-xs text-oxblood tabular-nums">
                {formatShortDate(task.deadline?.date)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const STEPS = [
  { n: "01", title: "Answer twelve questions", body: "States, work, family, insurance, car. Skip what you don't know." },
  { n: "02", title: "Rules match your situation", body: "Each one copied from an official source, with its date." },
  { n: "03", title: "Work through one plan", body: "Deadlines first, documents listed, sources one click away." },
];

export default function LandingPage() {
  return (
    <main>
      {/* ── Hook: green hero ── */}
      <section className="px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="hero-green relative mx-auto max-w-[88rem] overflow-hidden rounded-shell text-white">
          <div className="hero-rays pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative px-5 pb-0 pt-5 sm:px-8">
            <header className="flex items-center justify-between gap-3">
              <Logo tone="dark" />
              <nav aria-label="Primary" className="glass hidden items-center gap-1 rounded-full p-1 text-sm font-medium md:flex">
                <a href="#how" className="rounded-full bg-white px-4 py-2 text-ink">
                  How it works
                </a>
                <a href="#engine" className="rounded-full px-4 py-2">
                  Rule engine
                </a>
                <a href="#sources" className="rounded-full px-4 py-2">
                  Sources
                </a>
                <a href="#pricing" className="rounded-full px-4 py-2">
                  Pricing
                </a>
              </nav>
              <Link href="/dashboard?demo=1" className="btn btn-ink">
                Open demo
              </Link>
            </header>

            <Reveal immediate className="pt-14 sm:pt-20">
              <h1
                data-reveal
                className="mx-auto max-w-4xl text-center text-[clamp(2.25rem,5.2vw,4.25rem)] font-semibold uppercase leading-[1.02] tracking-[-0.02em]"
              >
                Life gets complicated. <span className="text-leaf">Civio makes it simple.</span>
              </h1>
              <p data-reveal className="mx-auto mt-5 max-w-xl text-center text-lg text-white/85">
                Manage taxes, insurance, paperwork, and life changes — all in one place.
              </p>
              <div data-reveal className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/onboarding" className="btn btn-lime">
                  Get Started <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link href="/dashboard?demo=1" className="btn glass text-white">
                  See a sample plan
                </Link>
              </div>
              <div data-reveal>
                <HeroVisual />
              </div>
            </Reveal>
          </div>

          {/* Floating cards on the lower edge */}
          <div className="relative mt-10 bg-forest/70 px-5 py-6 sm:px-8">
            <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
              {first && (
                <div className="rounded-card bg-white p-4 text-ink shadow-lift">
                  <p className="text-sm font-semibold">First deadline</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-sm text-muted">{first.title}</p>
                    <p className="shrink-0 font-display text-2xl font-semibold tabular-nums">
                      {days("CA-VEH-DL")} <span className="text-sm font-normal text-muted">days</span>
                    </p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-mist">
                    <div className="h-2 w-1/6 rounded-full bg-lime-deep" />
                  </div>
                </div>
              )}
              <p className="text-center text-[0.9375rem] text-white/85">
                One move from Texas to California touches {plan.length} obligations across four agencies. Civio lines
                them up by date.
              </p>
              <div className="rounded-card bg-white p-4 text-ink shadow-lift">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Sample plan progress</p>
                  <p className="font-mono text-xs text-muted tabular-nums">{donePercent}%</p>
                </div>
                <div className="mt-3 flex gap-1.5" aria-hidden="true">
                  {plan.map((task) => (
                    <span
                      key={task.id}
                      className={`h-6 flex-1 rounded-md ${DEMO_DONE.includes(task.id) ? "bg-lime-deep" : "bg-mist"}`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {DEMO_DONE.length} of {plan.length} tasks done in the demo
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works: three steps ── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32">
        <Reveal>
          <p data-reveal className="mono-label text-center text-moss">
            How it works
          </p>
          <h2
            data-reveal
            className="mx-auto mt-4 max-w-3xl text-center text-[clamp(1.875rem,3.6vw,2.875rem)] font-semibold uppercase leading-[1.08] tracking-[-0.02em]"
          >
            From a move to a plan <span className="text-taupe">— in 3 steps</span>
          </h2>

          <div className="mt-14 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
            <ol data-reveal className="grid gap-6">
              {STEPS.map((step) => (
                <li key={step.n} className="border-t border-line pt-4">
                  <p className="flex items-baseline gap-3 font-semibold">
                    <span className="font-mono text-sm text-taupe">{step.n}/</span>
                    {step.title}
                  </p>
                  <p className="mt-1 pl-9 text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>

            {/* Collage of real interface pieces */}
            <div data-reveal className="relative mx-auto h-80 w-full max-w-xs" aria-hidden="true">
              <div className="hero-green absolute left-0 top-0 grid size-28 place-items-center rounded-panel text-white shadow-lift">
                <span className="glass grid size-14 place-items-center rounded-2xl">
                  <CategoryIcon category="vehicle" className="size-6" />
                </span>
              </div>
              <div className="absolute left-12 top-16 w-56 rounded-panel bg-night p-4 text-white shadow-lift">
                <div className="flex gap-1">
                  <span className="h-1 w-6 rounded-full bg-white" />
                  <span className="h-1 w-1.5 rounded-full bg-night-line" />
                  <span className="h-1 w-1.5 rounded-full bg-night-line" />
                </div>
                <p className="mt-3 text-sm font-semibold">Do you own a vehicle?</p>
                <div className="mt-3 rounded-xl border border-lime px-3 py-2 text-sm">Yes</div>
                <div className="mt-1.5 rounded-xl border border-night-line px-3 py-2 text-sm text-night-muted">No</div>
              </div>
              <div className="absolute bottom-0 right-0 w-44 rounded-panel bg-white p-4 shadow-lift">
                <p className="text-xs text-muted">Due</p>
                <p className="font-display text-2xl font-semibold">{formatShortDate(first?.deadline?.date)}</p>
                <div className="iris mt-3 h-10 rounded-xl opacity-80" />
              </div>
            </div>

            <dl data-reveal className="grid grid-cols-3 gap-4 border-t border-line pt-4 lg:self-start">
              <div>
                <dt className="text-sm text-muted">rules</dt>
                <dd className="font-display text-3xl font-semibold tabular-nums">{RULES.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">sourced</dt>
                <dd className="font-display text-3xl font-semibold tabular-nums">{verifiedCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">modules</dt>
                <dd className="font-display text-3xl font-semibold tabular-nums">4</dd>
              </div>
            </dl>
          </div>
        </Reveal>
      </section>

      {/* ── Problem: dark band ── */}
      <section className="px-3 sm:px-5">
        <div className="on-dark mx-auto max-w-[88rem] rounded-shell bg-espresso text-on-dark">
          <Reveal className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
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
        </div>
      </section>

      {/* ── Solution: the engine itself ── */}
      <section id="engine" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32">
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
      <section id="sources" className="scroll-mt-8 px-3 sm:px-5">
        <div className="mx-auto max-w-[88rem] rounded-shell bg-surface">
          <Reveal className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-16 lg:py-28">
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
                  <dd className="font-display text-4xl font-semibold tabular-nums">{RULES.length - verifiedCount}</dd>
                </div>
              </dl>
            </div>

            {anatomy && (
              <div data-reveal className="tile p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-muted">
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

                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-hair px-4 py-3">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-oxblood" aria-hidden="true" strokeWidth={1.75} />
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-ink">Ask Civio:</span> “What if my smog check isn't done in
                    time?”
                  </p>
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-8 px-5 pt-24 sm:px-8 lg:pt-32">
        <Reveal>
          <h2
            data-reveal
            className="max-w-3xl text-[clamp(1.875rem,3.6vw,2.875rem)] font-medium leading-[1.1] tracking-[-0.03em]"
          >
            The plan is free. <span className="text-taupe">You pay when Civio does the paperwork.</span>
          </h2>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                data-reveal
                className={`flex flex-col rounded-panel p-6 sm:p-7 ${
                  plan.featured ? "bg-espresso text-on-dark" : "card"
                }`}
              >
                <p className={`mono-label ${plan.featured ? "text-dark-muted" : "text-muted"}`}>{plan.name}</p>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-5xl font-semibold tabular-nums">{plan.price}</span>
                  <span className={plan.featured ? "text-dark-muted" : "text-muted"}>{plan.cadence}</span>
                </p>
                <p className="mt-3 font-medium">{plan.blurb}</p>
                <ul className="mt-5 grid gap-2.5 text-[0.9375rem]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check
                        className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-leaf" : "text-moss"}`}
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  {plan.cta && (
                    <Link href={plan.cta.href} className={`btn ${plan.featured ? "btn-on-dark" : "btn-quiet"}`}>
                      {plan.cta.label} <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  )}
                  {plan.note && (
                    <p className={`text-sm ${plan.cta ? "mt-3" : ""} ${plan.featured ? "text-dark-muted" : "text-muted"}`}>
                      {plan.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Close ── */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
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
