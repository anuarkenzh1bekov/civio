import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
          <div className={styles.photograph}>
            <Image
              src="/landing/house-keys.webp"
              alt="A hand holds a ring of brass house keys."
              width={1878}
              height={1494}
              preload
              quality={90}
              sizes="(max-width: 700px) 90vw, (max-width: 1400px) 50vw, 760px"
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
