# Civio

One life change, one plan. Civio turns a move between US states into a personal checklist for taxes, health insurance, vehicle paperwork and school enrollment. Every task carries its deadline, documents and a link to the official source.

MVP scenario: moving from one state to another (demo: Texas → California).

The design rule: **the core is deterministic, and AI sits around it.** Requirements, deadlines, task order and totals come from a rule base and plain code. A model reads free text, explains rules and rewrites letters, and every AI feature has a rule-based fallback, so the product works with no key at all.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # rule engine, intake parser, costs, arrival check, documents
npm run typecheck
```

AI is optional. Copy `.env.example` to `.env.local` and set one key:

| Variable | Provider |
|---|---|
| `GOOGLE_API_KEY` | Google Gemini. Used first when set. `GEMINI_MODEL` overrides the default `gemini-flash-latest`. |
| `ANTHROPIC_API_KEY` | Anthropic Claude. Used when no Google key is set. |

`.env.local` is git-ignored. Do not commit a key.

## Screens

| Route | What it is |
|---|---|
| `/` | Landing page. The "Change one answer" block runs the real rule engine in the browser. Pricing at `#pricing`. |
| `/onboarding` | Describe the move in free text or with a photo of a document, or answer six steps. Either way it ends on a review step. Only the two states are required. |
| `/dashboard` | Progress, priorities, filters, task details with dependencies, arrival check, cost calculator, assistant. |
| `/documents` | Who-to-notify list (free) and letters (Move Pack). |
| `/dashboard?demo=1` | Loads the Texas → California sample plan. |
| `/dashboard?demo=1&loc=CA` | Same, with a simulated location in California to show the arrival check. |
| `/dashboard?s=<id>` | Opens a plan started on another device. |

## How it works

```
free text / photo ──► intake (model, or built-in parser) ──► user reviews ──┐
questionnaire ──────────────────────────────────────────────────────────────┤
                                                                            ▼
                  Profile ──► rule engine ──► tasks, ordered by deadline and dependency
                                   │              │
                                   │              ├─► cost calculator (user-entered amounts)
                                   │              └─► documents (templates) ──► model rewrites on request
                                   └─► retrieval ──► assistant (explains, never decides)
```

### Deterministic core

**Rule engine.** `src/lib/rules/data.ts` holds the rules as data: `rule_id`, `state`, `conditions`, `depends_on`, `task_template`, `source_url`, `last_verified`, and `effective_date` where it applies. `src/lib/rules/engine.ts` evaluates them:

- A condition has three outcomes: match, no match, unknown. A skipped answer is unknown, never "no".
- If any condition is unknown and none fails, the task is created as **Needs verification** and says which answer is missing.
- Rules with `verified: false` cover states Civio has no checked rule for. They always produce a Needs verification task that links to an official directory, with no deadline.
- A calendar date is only ever `move date + days from the rule` (or `arrival date + days` once arrival is confirmed). No model computes a date.

**Plan builder.** Tasks sort by computed deadline, then priority, and a task never appears before one it depends on (address proof before the driver license, insurance before registration). A dependent task shows what it is waiting for until that is ticked off.

**Cost calculator.** `src/lib/costs.ts` lists what is charged for the tasks in the plan and links each line to the official page. Civio stores no fee amounts: the user types what they find there and Civio adds it up. Tax and coverage changes are listed in words, never as numbers.

**Arrival check.** When the dashboard opens, the browser is asked for its location once per session. The coordinates are turned into a state in the browser (`src/lib/geo.ts`, bounding boxes) and never leave it. If that state is the destination, Civio offers to switch to the arrival checklist, and on confirmation deadlines count from today. This is a check on open, not tracking: a web page cannot follow location in the background and Civio does not try.

**Session without login.** The first save creates a random session id. The plan lives in `localStorage` and is mirrored to the server (`/api/session/[id]`), so "Continue on another device" is a link containing that id. Anyone with the link can open and edit the plan; there are no accounts. Storage is Node's built-in SQLite on Node 22.13+ and JSON files in `.data/` otherwise (`src/lib/server/sessions.ts`). On a host without a persistent disk, swap that file for Postgres.

### Where AI is used

1. **Intake** (`/api/intake`). Free text in any language, or a photo of a license, insurance card or lease, becomes profile fields through structured output. The result passes the same schema as any other profile, field by field, and the user reviews it before a plan is built. Without a key, a built-in parser handles text in English and common Russian wording.
2. **Explanations** (`/api/assistant`). Hybrid retrieval over a curated set of 36 official Texas / California texts on moving (licenses, registration, insurance, tax residency, schools, rental deposits, voting): **70% semantic cosine similarity + 30% normalized Okapi BM25**. Gemini `gemini-embedding-001` produces 768-dimensional document and query vectors. The server retrieves up to six passages, filters jurisdiction, and supplies them to the model alongside the deterministic plan. Answers use `[S1]` citations with source links supplied by the server. No relevant evidence means no model call. If embedding service is unavailable, the response explicitly reports keyword-only search; if generation fails, it displays retrieved excerpts. See `data/rag/README.md` for coverage, provenance, normalization, and refresh commands.
3. **Documents** (`/api/documents`). Letters are built from templates and the user's inputs. On request, the model rewrites a letter for tone and extra details; it is told not to add legal claims, deadlines or amounts and leaves a `[placeholder]` instead. Without a key the template is the letter.

The profile is sent to the assistant only when the user has switched sharing on. Names and addresses typed into letters stay in the browser and are sent to the model only when the user presses "Tailor with AI".

## Pricing

| Plan | Price | What it adds |
|---|---|---|
| Free | $0 | Full plan, assistant, cost calculator, who-to-notify list |
| Move Pack | $19 per move | Letters filled from the profile, AI tailoring, copy/download/print |
| Civio Watch | $5 per month | Planned: saved plans for repeat movers, rule-change notices, reminders |

Checkout is a demo: "Unlock Move Pack" flips a flag and charges nothing. Civio Watch is not built, and its price is a placeholder to be decided.

## What is verified, and what is not

19 rules: 14 state or federal rules with a source, 5 honest gaps (`verified: false`).

The deadlines and amounts in the rules were checked on 2026-11-14 against search results restricted to the official domains (dmv.ca.gov, ftb.ca.gov, edd.ca.gov, insurance.ca.gov, coveredca.com, cde.ca.gov, cdph.ca.gov, healthcare.gov, medicaid.gov, irs.gov, txdmv.gov). Most of these sites refuse automated access (dmv.ca.gov answers 403), so the pages themselves were not opened one by one. Before a public launch, open each `source_url` in a browser and confirm the wording; `last_verified` is the field to update.

Known limits:

- State coverage: California and Texas for vehicles, California for taxes and schools. Other states fall back to Needs verification.
- "Owns a vehicle" stands in for "drives" on the driver license rules.
- No fee table. Agency fees could not be verified from the build environment, so the calculator takes the user's numbers.
- The two task dependencies are practical ordering (documents before the DMV visit, insurance before registration), written from the rule text.
- Location is matched with bounding boxes, which overlap near state borders. The user always confirms.
- Civio gives general information. It is not legal, tax or insurance advice and it does not estimate savings.

## Stack

Next.js 16 (App Router, API routes), React 19, TypeScript, Tailwind CSS 4, Zod, GSAP for landing reveals, lucide icons, Gemini over REST or the Anthropic SDK, SQLite or JSON files for sessions, Vitest.
