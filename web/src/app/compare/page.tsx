import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "@/components/Link";
import { DestinationCompare } from "@/components/dashboard/DestinationCompare";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeMode";
import { DEMO_PROFILE } from "@/lib/demo";
import { useCivio } from "@/lib/store";
import { stateName } from "@/lib/states";
import styles from "./page.module.css";

export default function ComparePage() {
  const { ready, hasPlan, profile } = useCivio();

  if (!ready) {
    return <main className={styles.loading} aria-busy="true" aria-label="Loading comparison" />;
  }

  const comparisonProfile = hasPlan ? profile : DEMO_PROFILE;

  return (
    <div className={styles.page}>
      <header className={`sticky-glass-header ${styles.header}`}>
        <div className={styles.headerInner}>
          <Logo />
          <div className={styles.tools}>
            <ThemeToggle />
            <Link className={styles.backLink} href={hasPlan ? "/dashboard" : "/dashboard?demo=1"}>
              <ArrowLeft aria-hidden="true" size={16} />
              {hasPlan ? "Back to your plan" : "Back to demo"}
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div
          className={styles.ambient}
          aria-hidden="true"
          style={{
            backgroundImage: `linear-gradient(135deg, color-mix(in srgb, var(--color-canvas) 25%, transparent), color-mix(in srgb, var(--color-canvas) 68%, transparent)), url("/states/${(comparisonProfile.destinationState ?? "CA").toLowerCase()}.webp")`,
          }}
        />
        <section className={styles.heroCard}>
          <div>
            <p className={styles.eyebrow}>Civio · move planner</p>
            <h1><span className={styles.desktopTitle}>Your next move, in a new light.</span><span className={styles.mobileTitle}>Compare destinations</span></h1>
            <p className={styles.intro}>See what changes before you decide.</p>
          </div>
          <div className={styles.routeCards} aria-label="Your move">
            <div className={styles.routeCard}>
              <span>FROM</span>
              <strong>{stateName(comparisonProfile.currentState)}</strong>
            </div>
            <ArrowRight aria-hidden="true" />
            <div className={styles.routeCard}>
              <span>TO</span>
              <strong>{stateName(comparisonProfile.destinationState)}</strong>
            </div>
          </div>
        </section>

        <DestinationCompare profile={comparisonProfile} />

        {!hasPlan && (
          <aside className={styles.nextStep}>
            <div>
              <h2>Want to compare with your own plan?</h2>
              <p>Set up your move details first, then use your budget estimates here.</p>
            </div>
            <Link className="btn btn-primary" href="/onboarding">
              Build my plan <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </aside>
        )}
      </main>
    </div>
  );
}
