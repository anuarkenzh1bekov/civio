"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, CornerUpLeft, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo, LogoMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeMode";
import { IntakeBox } from "@/components/onboarding/IntakeBox";
import type { IntakeResponse } from "@/app/api/intake/route";
import { ForecastDetails } from "@/components/ForecastDetails";
import { difference, type MoveBudget } from "@/lib/budget";
import {
  acceptReply, answerLabel, answersSchema, checklistAnswers, completedForecast, initialAnswers, question, questionOrder, type Answers, type Step,
} from "@/lib/forecast/conversation";
import { budgetForAnswers, estimateBudget, forecastOutcome, forecastSources } from "@/lib/forecast/model";
import { useCivio } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { Composer } from "./Composer";
import { marketNote, Preview } from "./Preview";
import styles from "./planner.module.css";

const draftKey = "civio:planner-draft:v1";
type Session = { answers: Answers; extras: boolean; keepEdits: boolean; intake?: Pick<IntakeResponse, "profile" | "found"> };

function resume(profile: Profile): Session {
  try {
    const raw = JSON.parse(sessionStorage.getItem(draftKey) || "null");
    const checked = answersSchema.safeParse(raw?.answers);
    if (checked.success && raw?.base === JSON.stringify(profile)) {
      return { answers: checked.data, extras: raw.extras === true, keepEdits: raw.keepEdits !== false,
        intake: Array.isArray(raw.intake?.found) && raw.intake?.profile ? raw.intake : undefined };
    }
  } catch { /* A private tab can still use the live conversation. */ }
  return { answers: initialAnswers(profile), extras: false, keepEdits: true };
}

function Bot({ children }: { children: React.ReactNode }) {
  return <div className={styles.bot}><span className={styles.mark} aria-label="Civio"><LogoMark className="size-[18px]" /></span>
    <div className={styles.botBody}>{children}</div></div>;
}

function Planner({ profile, save }: { profile: Profile; save: (profile: Profile) => void }) {
  const router = useRouter();
  const [session, setSession] = useState<Session>(() => resume(profile));
  const [edit, setEdit] = useState<Step | null>(null);
  const focus = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);
  const { answers: a, extras, keepEdits } = session;
  const order = questionOrder(a, extras);
  const step = edit ?? order.find(s => a[s] === undefined) ?? null;
  const visible = step ? order.slice(0, order.indexOf(step)) : order;
  const answered = visible.filter(s => a[s] !== undefined);
  const recent = step ? answered.slice(-1) : [];
  const history = answered.slice(0, answered.length - recent.length);
  const forecast = completedForecast(a);
  const budget = forecast ? budgetForAnswers(forecast, profile, keepEdits) : null;
  const outcome = forecast && budget ? forecastOutcome(forecast, budget) : null;
  const projected = forecast && estimateBudget(forecast);
  const canKeep = Boolean(profile.budget && a.origin === profile.currentState && a.destination === profile.destinationState && projected &&
    (Object.keys(projected) as (keyof MoveBudget)[]).some(k => profile.budget?.[k] !== undefined && profile.budget[k] !== projected[k]));
  const base = JSON.stringify(profile);
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ ...session, base })); } catch { /* The conversation is still usable. */ }
  }, [session, base]);
  useEffect(() => {
    if (interacted.current) {
      focus.current?.focus({ preventScroll: true });
      focus.current?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [step]);
  function submit(input: string) {
    if (!step) return;
    const result = acceptReply(step, input, a);
    if (result.answers === undefined) return result.error;
    interacted.current = true;
    setSession({ ...session, answers: result.answers });
    setEdit(null);
  }
  function readIntake(patch: Partial<Profile>, result: IntakeResponse) {
    const fields = initialAnswers(patch);
    const known = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const answers = { ...a, ...known };
    if (answers.origin === answers.destination) delete answers.destination;
    if (answers.origin !== a.origin || answers.destination !== a.destination) delete answers.areas;
    interacted.current = true;
    setEdit(null);
    setSession({ ...session, answers, intake: { profile: patch, found: result.found } });
  }
  function finish() {
    if (!forecast || !budget) return;
    const changes: Answers = { payMode: a.payMode, filing: a.filing };
    const previous = initialAnswers({ ...profile, ...session.intake?.profile });
    for (const key of ["work", "children", "date", "health", "car"] as const) {
      if (a[key] !== undefined && a[key] !== previous[key]) Object.assign(changes, { [key]: a[key] });
    }
    const details = checklistAnswers(changes);
    const intake = session.intake?.profile;
    const zip = intake?.zip && (!intake.destinationState || intake.destinationState === forecast.destination) ? intake.zip
      : profile.destinationState === forecast.destination ? profile.zip : undefined;
    save({ ...profile, ...intake, ...details, currentState: forecast.origin, destinationState: forecast.destination, forecast, budget, zip,
      arrivedOn: profile.destinationState === forecast.destination ? profile.arrivedOn : undefined });
    try { sessionStorage.removeItem(draftKey); } catch { /* Optional persistence. */ }
    router.push("/dashboard");
  }
  const title = step ? question(step, a) : "Your move forecast";
  const exchange = (s: Step) => <div key={s} className={styles.exchange}>
    <Bot>{question(s, a)}</Bot>
    <button className={styles.reply} type="button" aria-label={`Edit answer: ${answerLabel(s, a)}`}
      onClick={() => { interacted.current = true; setEdit(s); }}>{answerLabel(s, a)}<Pencil size={12} aria-hidden="true" /></button>
    {s === "destination" && <Bot><p className={styles.market}>{marketNote(a)} <a href={forecastSources.prices}>BEA, 2024</a></p></Bot>}
  </div>;
  return <div className={styles.page}>
    <header className={styles.header + " sticky-glass-header"}><div><Logo /><div className={styles.tools}><ThemeToggle />
      {profile.currentState && profile.destinationState && <Link href="/dashboard">My plan <ArrowRight size={14} /></Link>}
    </div></div></header>
    <main className={styles.layout}>
      <section className={styles.chat} aria-label="Guided planning conversation">
        <div className={styles.title}><h1>Plan your move<span>.</span></h1></div>
        <div className={styles.thread}>
          {session.intake && <details className={styles.history}><summary>Details from your description</summary><ul className={styles.readFields}>
            {session.intake.found.map(item => <li key={item.field}><strong>{item.label}</strong> {item.value}</li>)}
          </ul></details>}
          {history.length > 0 && <details key={history.length} className={styles.history}><summary>Review {history.length} earlier {history.length === 1 ? "answer" : "answers"}</summary>{history.map(exchange)}</details>}
          {recent.map(exchange)}
          <Bot><h2 className={styles.prompt} ref={focus} tabIndex={-1}>{title}</h2></Bot>
          {step ? <Composer key={step} step={step} answers={a} onReply={submit} editing={Boolean(edit)} cancel={() => setEdit(null)} /> :
            forecast && budget && outcome && <div className={styles.review}>
              <div className={styles.result}><p>Change in your monthly balance</p><strong>{outcome.monthly === null ? "Needs monthly budget" : difference(outcome.monthly)}</strong></div>
              {canKeep && <label className={styles.keep}><input type="checkbox" checked={keepEdits} onChange={e => setSession(s => ({ ...s, keepEdits: e.target.checked }))} /> Keep my manual budget amounts</label>}
              <ForecastDetails forecast={forecast} budget={budget} />
              <div className={styles.reviewActions}>
                <button type="button" className={styles.solid} onClick={finish}>Save and open my plan <ArrowRight size={17} /></button>
                {!extras && <button type="button" className={styles.secondary} onClick={() => { interacted.current = true; setSession(s => ({ ...s, extras: true })); }}>Personalize my checklist <ChevronDown size={15} /></button>}
              </div>
            </div>}
          {step && visible.length > 0 && !edit && <button type="button" className={styles.back} onClick={() => { interacted.current = true; setEdit(visible[visible.length - 1]!); }}><CornerUpLeft size={14} /> Change my last answer</button>}
          {step && extras && forecast && <button type="button" className={styles.under} onClick={() => { setEdit(null); setSession(s => ({ ...s, extras: false })); }}>Return to forecast</button>}
          {(step === "origin" || step === "destination") && <details className={styles.intake}><summary>Describe my move or add a photo</summary>
            <div className="on-stage text-on-stage"><IntakeBox onRead={readIntake} /></div>
          </details>}
        </div>
        <Link className={styles.detailLink} href="/onboarding/details">{profile.currentState && profile.destinationState ? "Edit full profile" : "Use the full form"}</Link>
      </section>
      <Preview a={a} budget={budget} />
    </main>
  </div>;
}

export default function OnboardingPage() {
  const { ready, profile, saveProfile } = useCivio();
  if (!ready) return <main className={styles.page} aria-busy="true" />;
  return <Planner profile={profile} save={saveProfile} />;
}
