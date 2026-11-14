# Civio

One life change, one plan. Civio turns a move between US states into a personal checklist for taxes, health insurance, vehicle paperwork and school enrollment. Every task carries its deadline, documents and a link to the official source.

MVP scenario: moving from one state to another (demo: Texas → California).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # rule engine tests
npm run typecheck
```

The assistant works without any setup in "rules only" mode: it returns the matching rules as they are. For generated explanations, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

## Screens

| Route | What it is |
|---|---|
| `/` | Landing page. The "Change one answer" block runs the real rule engine in the browser. |
| `/onboarding` | Six-step questionnaire with conditional questions. Only the two states are required. |
| `/dashboard` | Progress, priorities, category and status filters, task details, assistant. |
| `/dashboard?demo=1` | Loads the Texas → California sample plan. |

The profile and task progress are stored in the browser (`localStorage`). There is no account and no database yet.

## How it works

```
questionnaire → Profile → rule engine (src/lib/rules) → tasks → dashboard
                                   │
                                   └→ retrieval → assistant (explains, never decides)
```

### Rule engine

`src/lib/rules/data.ts` holds the rules as data. Each rule has `rule_id`, `state`, `conditions`, `task_template`, `source_url`, `last_verified` and, where it applies, `effective_date`.

`src/lib/rules/engine.ts` evaluates them:

- A condition has three outcomes: match, no match, unknown. A skipped answer is unknown, never "no".
- If any condition is unknown and none fails, the task is created with the status **Needs verification** and says which answer is missing.
- Rules with `verified: false` cover states Civio has no checked rule for. They always produce a Needs verification task that links to an official directory, with no deadline.
- A calendar date is only ever `move date + days from the rule`. The model never computes dates.

### Assistant

`POST /api/assistant` recomputes the plan on the server, retrieves the most relevant rules for the question (`src/lib/assistant/retrieve.ts`), and streams an answer from Claude with those rules as its only source of requirements. Source links shown under an answer come from the rule base, not from the model. The profile is sent only when the user has switched sharing on.

## What is verified, and what is not

18 rules: 13 state or federal rules with a source, 5 honest gaps (`verified: false`).

The deadlines and amounts were checked on 2026-11-14 against search results restricted to the official domains (dmv.ca.gov, ftb.ca.gov, edd.ca.gov, insurance.ca.gov, coveredca.com, cde.ca.gov, cdph.ca.gov, healthcare.gov, medicaid.gov, irs.gov, txdmv.gov). Most of these sites refused direct automated access from the build environment, so the pages themselves were not opened one by one. Before a public launch, open each `source_url` in a browser and confirm the wording; `last_verified` is the field to update.

Known limits:

- State coverage: California and Texas for vehicles, California for taxes and schools. Other states fall back to Needs verification.
- "Owns a vehicle" stands in for "drives" on the driver license rules.
- Civio gives general information. It is not legal, tax or insurance advice and it does not estimate savings.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Astryx (`@astryxdesign/core` with the neutral theme, recolored to Civio's palette), GSAP for landing reveals, lucide icons, Anthropic SDK, Vitest.

### Where Astryx is used

Layout and visuals are Tailwind. Astryx supplies the interactive pieces that are hard to get right by hand:

| Component | Where |
|---|---|
| `Drawer`, `DrawerHeader` | Assistant side panel (focus handling, Escape, scrim) |
| `Markdown`, `Citation` | Assistant answers; a rule id like `[CA-VEH-REG]` becomes a link to its official source |
| `CommandPalette` | Ctrl/⌘ K on the dashboard: jump to a task or run an action |
| `AlertDialog` | Confirmation before "Start over" clears the plan |
| `useToast` | "Marked as done" with Undo |
| `Tooltip` | Why a task needs verification |
| `Selector` | Searchable state pickers in the questionnaire |
| `Switch` | Profile sharing with the assistant |

`/dashboard?panel=ask` and `/dashboard?panel=search` open the assistant and the palette directly. The CSS layer order in `src/app/globals.css` follows the Astryx Next.js + Tailwind example; the overrides at the end of that file keep Civio's typefaces and text colors.
