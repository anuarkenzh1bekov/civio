import { ArrowRight, ArrowUpRight, FileText, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LiveEngine } from "@/components/landing/LiveEngine";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { CategoryIcon } from "@/components/ui";
import { DEMO_PROFILE } from "@/lib/demo";
import { formatDate, formatShortDate } from "@/lib/format";
import { RULES, ruleById } from "@/lib/rules/data";
import { generatePlan } from "@/lib/rules/engine";

const plan = generatePlan(DEMO_PROFILE, RULES);
const first = plan.find((t) => t.deadline?.date);
const anatomy = plan.find((t) => t.id === "CA-VEH-REG");
const verified = RULES.filter((r) => r.verified);
/** The agencies behind the verified rules, in the order they first appear. */
const AGENCIES = [...new Set(verified.map((r) => r.source_name.split(" — ")[0]))];

function days(ruleId: string): number {
  return ruleById(ruleId)?.task_template.deadline?.daysAfterMove ?? 0;
}

/** Real deadlines from the rule base: the same errand, two states, different clocks. */
const CLOCKS = [
  { errand: "Register your car", rows: [{ state: "California", days: days("CA-VEH-REG") }, { state: "Texas", days: days("TX-VEH-REG") }] },
  { errand: "Swap your driver license", rows: [{ state: "California", days: days("CA-VEH-DL") }, { state: "Texas", days: days("TX-VEH-DL") }] },
];
const LONGEST = Math.max(...CLOCKS.flatMap((c) => c.rows.map((r) => r.days)));

const STEPS = [
  { n: "01", title: "Answer twelve questions", body: "States, work, family, insurance, car. Skip what you don't know." },
  { n: "02", title: "Rules match your situation", body: "Each one copied from an official source, with its date." },
  { n: "03", title: "Work through one plan", body: "Deadlines first, documents listed, sources one click away." },
];

const H2 = "text-[clamp(2rem,3.8vw,3.25rem)] font-normal leading-[1.08] tracking-[-0.03em]";

export default function LandingPage() {
  return (
    <main>
      {/* ── Nav ── */}
      <header className="mx-auto flex max-w-[88rem] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-8 text-[0.9375rem] text-muted md:flex">
          <a href="#how" className="hover:text-ink">
            How it works
          </a>
          <a href="#engine" className="hover:text-ink">
            Rule engine
          </a>
          <a href="#sources" className="hover:text-ink">
            Sources
          </a>
        </nav>
        <Link href="/dashboard?demo=1" className="btn btn-ink">
          Open demo
        </Link>
      </header>

      {/* ── Hook ── */}
      <section className="px-3 sm:px-5">
        <div className="hero-stage relative mx-auto max-w-[88rem] overflow-hidden rounded-shell text-white">
          <div className="hero-beams pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="hero-dots pointer-events-none absolute inset-0" aria-hidden="true" />

          <Reveal immediate className="relative px-5 pt-16 text-center sm:px-8 sm:pt-24">
            <p
              data-reveal
              className="mono-label mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-white/80"
            >
              <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
              For moves between US states
            </p>
            <h1
              data-reveal
              className="mx-auto mt-7 max-w-4xl text-[clamp(2.5rem,6vw,5rem)] font-normal leading-[1.04] tracking-[-0.035em]"
            >
              Life gets complicated.
              <br />
              Civio makes it <span className="serif-accent text-[1.06em]">simple.</span>
            </h1>
            <p data-reveal className="mx-auto mt-6 max-w-lg text-lg text-white/70">
              Manage taxes, insurance, paperwork, and life changes — all in one place.
            </p>
            <div data-reveal className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/onboarding" className="btn bg-white text-ink">
                Get Started <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/dashboard?demo=1" className="btn border border-white/20 text-white">
                See a sample plan
              </Link>
            </div>

            {/* The product itself, rising out of the stage */}
            <div data-reveal className="relative mx-auto mt-16 max-w-5xl sm:mt-20">
              <div className="h-56 overflow-hidden rounded-t-[1.75rem] border border-b-0 border-white/15 bg-white/5 p-2 pb-0 sm:h-[30rem]">
                <Image
                  src="/landing/dashboard.png"
                  alt="Civio dashboard for a move from Texas to California: progress, tasks by module, the next deadline and the task list"
                  width={2880}
                  height={1720}
                  priority
                  sizes="(min-width: 1024px) 1008px, 100vw"
                  className="w-full rounded-t-[1.25rem]"
                />
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#171c0e] to-transparent"
                aria-hidden="true"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Whose rules these are ── */}
      <section aria-label="Sources" className="mx-auto max-w-6xl px-5 pt-12 sm:px-8">
        <p className="text-center text-sm text-muted">Rules copied from the agencies that set them</p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[0.9375rem] font-medium text-taupe">
          {AGENCIES.map((agency) => (
            <li key={agency} className="whitespace-nowrap">
              {agency}
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works: three steps ── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32">
        <Reveal>
          <p data-reveal className="mono-label text-center text-moss">
            How it works
          </p>
          <h2 data-reveal className={`mx-auto mt-4 max-w-3xl text-center ${H2}`}>
            From a move to a plan, <span className="serif-accent text-taupe">in three steps.</span>
          </h2>

          <div className="mt-16 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
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
              <div className="hero-stage absolute left-0 top-0 grid size-28 place-items-center rounded-panel text-white shadow-lift">
                <span className="grid size-14 place-items-center rounded-2xl border border-white/20 bg-white/10">
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
                <dd className="font-display text-3xl font-semibold tabular-nums">{verified.length}</dd>
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
        <div className="on-dark mx-auto max-w-[88rem] rounded-shell bg-espresso text-cream">
          <Reveal className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 data-reveal className={`max-w-3xl ${H2}`}>
              One move resets your paperwork.{" "}
              <span className="serif-accent text-dark-muted">And every state runs a different clock.</span>
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
          <h2 data-reveal className={`max-w-2xl ${H2}`}>
            Change one answer. <span className="serif-accent text-taupe">Watch the whole plan follow.</span>
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
              <h2 data-reveal className={H2}>
                Rules decide. <span className="serif-accent text-taupe">AI explains.</span>
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
                  <dd className="font-display text-4xl font-semibold tabular-nums">{RULES.length - verified.length}</dd>
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

      {/* ── Close: the stage again ── */}
      <section className="px-3 py-24 sm:px-5 lg:py-32">
        <div className="hero-stage relative mx-auto max-w-[88rem] overflow-hidden rounded-shell text-white">
          <div className="hero-dots pointer-events-none absolute inset-0" aria-hidden="true" />
          <Reveal className="relative px-5 py-20 text-center sm:px-8 lg:py-28">
            <h2 data-reveal className={`mx-auto max-w-3xl ${H2}`}>
              Twelve questions. Then you know what's due, <span className="serif-accent">and when.</span>
            </h2>
            <div data-reveal className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/onboarding" className="btn bg-white text-ink">
                Get Started <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/dashboard?demo=1" className="btn border border-white/20 text-white">
                See a sample plan
              </Link>
            </div>
          </Reveal>
        </div>
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
