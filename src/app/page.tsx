import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { BudgetProjection } from "@/components/BudgetProjection";
import { CityBackdrop } from "@/components/landing/CityBackdrop";
import { LiveEngine } from "@/components/landing/LiveEngine";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeMode";
import { compareBudget, dollars } from "@/lib/budget";
import { DEMO_PROFILE } from "@/lib/demo";
import { RULES } from "@/lib/rules/data";
import { stateName } from "@/lib/states";
import styles from "./landing.module.css";

const sourceRules = ["CA-VEH-REG", "CA-TAX-540NR-IN", "CA-HEALTH-COVEREDCA", "CA-FAM-SCHOOL"];
const sources = RULES.filter((rule) => sourceRules.includes(rule.rule_id));
const sample = compareBudget(DEMO_PROFILE.budget);

function sign(value: number | null) {
  if (value === null || value === 0) return undefined;
  return value < 0 ? "loss" : "gain";
}

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

function amount(value: number | null) {
  return value === null ? "—" : dollars(value).replace("-", "−");
}

export default function LandingPage() {
  return (
    <main className={styles.home}>
      <div className={styles.cover}>
        <header className={`${styles.header} sticky-glass-header`}>
          <div className={styles.headerInner}>
            <Logo />
            <nav aria-label="Primary">
              <a href="#outlook">Budget</a>
              <a href="#checklist">Checklist</a>
              <a href="#pricing">Pricing</a>
              <a href="#sources">Sources</a>
            </nav>
            <div className={styles.headerActions}>
              <ThemeToggle />
              <Link href="/dashboard" className={styles.planLink}>
                My plan <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>

        <section className={styles.scene} aria-labelledby="move-question">
          <CityBackdrop />
          <div className={styles.sceneInner}>
            <div className={styles.copy}>
              <h1 id="move-question">Will the move <span>pay off?</span></h1>
              <p>Compare what you’d keep in two states after housing, everyday expenses and the cost of moving.</p>
              <div className={styles.actions}>
                <Link className={styles.primary} href="/onboarding">
                  Compare my budget <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link className={styles.secondary} href="/dashboard?demo=1">
                  Open demo <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
          <div className={styles.photographs} aria-hidden="true">
            <Image
              className={styles.keyHand}
              src="/landing/house-keys.webp"
              alt=""
              width={1878}
              height={1494}
              preload
              quality={90}
              sizes="(max-width: 700px) 38vw, (max-width: 1740px) 27vw, 470px"
            />
            <Image
              className={styles.paperHand}
              src="/landing/hand-with-invoice.webp"
              alt=""
              width={1080}
              height={1537}
              quality={90}
              loading="eager"
              sizes="(max-width: 700px) 36vw, (max-width: 1687px) 24vw, 405px"
            />
            <Image
              className={styles.cashHand}
              src="/landing/hand-with-dollars.webp"
              alt=""
              width={1320}
              height={534}
              quality={90}
              loading="eager"
              sizes="(max-width: 700px) 48vw, (max-width: 1647px) 34vw, 560px"
            />
          </div>
        </section>

        <section className={styles.summary} aria-label="Example moving budget">
          <div className={styles.summaryInner}>
            <div className={styles.route}>
              <p>Sample move</p>
              <h2>
                {stateName(DEMO_PROFILE.currentState)}
                <span aria-hidden="true"> → </span><span className="sr-only"> to </span>
                {stateName(DEMO_PROFILE.destinationState)}
              </h2>
            </div>
            <dl className={styles.metrics}>
              <div><dt>Monthly difference</dt><dd>{amount(sample.monthly)}</dd></div>
              <div><dt>One-time moving costs</dt><dd>{amount(sample.moving)}</dd></div>
              <div><dt>First year vs. staying</dt><dd data-sign={sign(sample.year)}>{amount(sample.year)}</dd></div>
            </dl>
          </div>
        </section>
      </div>

      <section id="outlook" className={styles.outlook}>
        <div className={styles.explanation}>
          <h2>A raise can still leave you with less.</h2>
          <p>In this sample, take-home pay rises by $500 a month. Housing and everyday expenses rise by $1,000.</p>
          <Link className={styles.textLink} href="/dashboard?demo=1#budget">
            Change the numbers <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <BudgetProjection budget={DEMO_PROFILE.budget} />
      </section>

      <section className={styles.checklist} id="checklist">
        <h2>Your moving checklist</h2>
        <p>Explore the paperwork for a household leaving New York. Choose a destination and adjust the household details.</p>
        <LiveEngine />
      </section>

      <section className={styles.checklist} id="pricing">
        <h2>The plan is free. You pay when Civio does the paperwork.</h2>
        <p>Rules, deadlines and the assistant cost nothing. Letters written from your profile are the paid part.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-panel border p-6 sm:p-7 ${
                plan.featured ? "border-stage bg-stage text-on-stage" : "border-line bg-card text-ink"
              }`}
            >
              <p className={`mono-label ${plan.featured ? "text-on-stage-muted" : "text-ink-muted"}`}>{plan.name}</p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold tabular-nums">{plan.price}</span>
                <span className={plan.featured ? "text-on-stage-muted" : "text-ink-muted"}>{plan.cadence}</span>
              </p>
              <p className="mt-3 font-medium">{plan.blurb}</p>
              <ul className="mt-5 grid gap-2.5 text-[0.9375rem]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check
                      className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-brand-bright" : "text-ok"}`}
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-7">
                {plan.cta && (
                  <Link href={plan.cta.href} className={`btn ${plan.featured ? "btn-stage" : "btn-quiet"}`}>
                    {plan.cta.label} <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )}
                {plan.note && (
                  <p className={`text-sm ${plan.cta ? "mt-3" : ""} ${plan.featured ? "text-on-stage-muted" : "text-ink-muted"}`}>
                    {plan.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer id="sources" className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.sourceRow}>
            <div><Logo /><p>Official sources for the California sample plan</p></div>
            <div className={styles.sources}>
              {sources.map((rule) => (
                <a key={rule.rule_id} href={rule.source_url} target="_blank" rel="noreferrer">
                  {rule.source_name.split(" — ")[0]} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
          <div id="photo-credit" className={styles.credits}>
            <p>House keys photographed by <a href="https://www.pexels.com/photo/hand-holding-keys-to-a-new-house-real-estate-residential-27522902/">Jakub Żerdzicki</a>. Background removed.</p>
            <p>Big Sur photograph by <a href="https://commons.wikimedia.org/wiki/File:Big_Sur_coastline_and_Bixby_Bridge.jpg">Daniel Hartwig</a>. <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>. Cropped for the plan. <a href="/landing/big-sur.jpg">Full resolution</a>.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
