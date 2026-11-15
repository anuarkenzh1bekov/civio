# Civio

Civio helps a household work out whether a move to another US state pays off, and then walks it through the paperwork the move brings: taxes, health insurance, vehicle registration and school enrollment.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/civio-demo-dark.gif">
  <img src="docs/civio-demo-light.gif" alt="Civio walkthrough: landing page, onboarding chat, dashboard, budget, checklist, a task with its source, the assistant and the who-to-notify list">
</picture>

The recording follows your GitHub theme. Both versions: [light](docs/civio-demo-light.gif), [dark](docs/civio-demo-dark.gif). Live demo: https://civio-1008637543619.us-central1.run.app/

[Walkthrough of the mobile planner](docs/civio-demo.gif)

## Contents

- [What Civio is](#what-civio-is)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Screens](#screens)
- [How it works](#how-it-works)
- [API](#api)
- [What is verified, and what is not](#what-is-verified-and-what-is-not)
- [Pricing](#pricing)
- [Stack](#stack)
- [Deploy on Google Cloud Run](#deploy-on-google-cloud-run)

## What Civio is

A move to another state raises two questions at once. Will the household have more or less money after it? And what has to be filed, changed or cancelled, and by when? The answers are spread across state and federal sites, and each state has its own deadlines. Civio puts the budget and the paperwork in one plan.

### Who it is for

A household that is planning a move between US states, or is still choosing between up to three destinations. The demo follows a family going from Texas to California.

### What you put in

- What you take home each month now and what you expect after the move.
- Housing, other living costs and the one-time cost of the move itself.
- A few facts about the household: work, children, health insurance, a car.

You can answer step by step, describe the move in your own words, or upload a photo of a license, insurance card or lease. Skipping a question is allowed. Civio then marks the tasks that depend on it as "Needs verification" and does not guess.

### What you get back

| | |
|---|---|
| First-year outlook | How much cash the move adds or takes away over 12 months, moving costs included, and the take-home pay you would need to keep today's monthly balance. |
| Destination comparison | The same numbers for up to three states side by side. |
| Checklist | Tasks for taxes, health insurance, vehicle paperwork and school enrollment. Each has a date counted from your move date, the steps, the documents to bring and a link to the official page. Tasks appear in the order you can actually do them. |
| Cost calculator | The fees your tasks involve, each linked to the page that states the amount. You enter the amounts and Civio totals them. |
| Who to notify | A list of the offices and companies that need your new address. |
| Letters and forms | Change-of-address letters filled from your answers, and the official IRS Form 8822 filled in the browser. |
| Reminders | An email 7, 3 and 1 days before a deadline, if you ask for them. |
| Assistant | Plain-language answers about your tasks, each with links to the official text it came from. |

### What it does not do

Civio gives general information. It is not legal, tax or insurance advice. It has checked rules for five states so far (California, Texas, Florida, Washington and New York) and says so when a state is not covered. It stores no fee amounts. There are no accounts: a plan lives in your browser and under an anonymous link you can open on another device.

The plan, the assistant, the cost calculator and the who-to-notify list are free. Letters are a paid add-on, and checkout is a demo for now. Details are under [Pricing](#pricing).

## Quick start

You need Node 22+, Python 3.12+ and [uv](https://docs.astral.sh/uv/). Run the two parts in two terminals:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload      # http://127.0.0.1:8000, API docs at /docs
```

```bash
cd web
npm install
npm run dev                               # http://localhost:3000
```

Open http://localhost:3000. The frontend proxies `/api` to the backend, so there is nothing else to configure. To see a filled-in plan without answering anything, open http://localhost:3000/dashboard?demo=1.

### AI keys (optional)

Copy `backend/.env.example` to `backend/.env` and set one key. Without a key, text is read by the built-in parser, the assistant shows the retrieved source passages, and letters stay as templates.

| Variable | Provider |
|---|---|
| `GOOGLE_API_KEY` | Google Gemini. Used first when set. `GEMINI_MODEL` overrides the default `gemini-flash-latest`. |
| `ANTHROPIC_API_KEY` | Anthropic Claude. Used when no Google key is set. |

`.env` is git-ignored. Do not commit a key.

### Tests and checks

```bash
cd backend && uv run pytest               # rule engine, intake, retrieval, API
cd web && npm test                        # budget, forecast, costs, arrival check, letters, chat flow
cd web && npm run typecheck && npm run build
```

### Deploying the two parts separately

`npm run build` writes static files to `web/dist`. Either serve them behind the same host as the backend with `/api` routed to it, or use two hosts: build the frontend with `VITE_API_URL=https://api.example.com` and start the backend with `CORS_ORIGINS=https://app.example.com`.

## Project layout

```
web/                      React 19 + Vite
  src/app/                one folder per page
  src/components/         shared and per-page components
  src/lib/                calculators, browser store, API client (api.ts)
backend/                  FastAPI
  app/rules/              rule base (rules.json) and rule engine
  app/intake/             free-text parser, model extraction, chat answers
  app/rag/                retrieval over official texts
  app/routers/            HTTP endpoints
  data/rag/               source corpus and embedding index
  scripts/                corpus ingestion, index build, retrieval eval
  tests/
docs/                     demo recording, photo credits
```

What runs where:

| In the browser (`web/`) | On the server (`backend/`) |
|---|---|
| Budget comparison and first-year forecast | Rule engine and rule base |
| Cost calculator | Who-to-notify list |
| Letter preview (names and addresses stay local) | Intake: free text, photos, guided chat |
| Arrival check (coordinates stay local) | Assistant with retrieval |
| Order of the guided questions | Letter tailoring, sessions |

Everything that recalculates as you type stays in the browser. The browser never holds the rule base: it asks the backend for the plan and layers the ticked-off tasks on top.

## Screens

| Route | What it is |
|---|---|
| `/` | Landing page: the budget outlook, the live rule engine and pricing. |
| `/onboarding` | Guided questions that end in a first-year forecast. A description in free text or a photo of a document fills in the answers. |
| `/onboarding/details` | The full questionnaire with a guided chat, for the household details behind the checklist. |
| `/dashboard` | Editable budget, first-year difference, checklist with filters and dependencies, arrival check, cost calculator, assistant. |
| `/documents` | Who-to-notify list, official IRS Form 8822 and Move Pack letters. |
| `/compare` | Up to three destinations side by side, each with editable amounts and a first-year outlook. |
| `/dashboard?demo=1` | A Texas → California example with illustrative amounts. It lives in memory and never overwrites a saved plan. |
| `/dashboard?s=<id>` | Opens a plan started on another device. |

`/dashboard?panel=ask` and `/dashboard?panel=search` open the assistant and the command palette directly.

The profile, task progress and theme are stored in the browser (`localStorage`). The plan is also mirrored to the server under an anonymous session id. There are no accounts.

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

**Rule engine.** `backend/app/rules/rules.json` holds the rules as data: `rule_id`, `state`, `conditions`, `depends_on`, `task_template`, `source_url`, `last_verified`, and `effective_date` where it applies. `backend/app/rules/engine.py` evaluates them:

- A condition has three outcomes: match, no match, unknown. A skipped answer is unknown, never "no".
- If any condition is unknown and none fails, the task is created as **Needs verification** and says which answer is missing.
- Rules with `verified: false` cover states Civio has no checked rule for. They always produce a Needs verification task that links to an official directory, with no deadline.
- A calendar date is only ever `move date + days from the rule`, or `arrival date + days` once arrival is confirmed. No model computes a date.

**Plan builder.** Tasks sort by computed deadline, then priority, and a task never appears before one it depends on (address proof before the driver license, insurance before registration). A dependent task shows what it is waiting for until that is ticked off.

**Budget and forecast.** `web/src/lib/budget.ts` compares what is left each month before and after the move, and the first year is 12 months of that difference less one-time moving costs. A blank amount stays unknown. `web/src/lib/forecast/` proposes starting amounts from public data (Census median rents, BEA price levels, BLS spending, federal and state tax brackets), and every amount can be edited.

**Cost calculator.** `web/src/lib/costs.ts` lists what is charged for the tasks in the plan and links each line to the official page. Civio stores no fee amounts: the user types what they find there and Civio adds it up. Tax and coverage changes are listed in words, never as numbers.

**Arrival check.** When the dashboard opens, the browser is asked for its location once per session. The coordinates are turned into a state in the browser (`web/src/lib/geo.ts`, bounding boxes) and never leave it. If that state is the destination, Civio offers to switch to the arrival checklist, and on confirmation deadlines count from today. This is a check on open, not tracking.

**Session without login.** The first save creates a random session id. The plan lives in `localStorage` and is mirrored to the server, so "Continue on another device" is a link containing that id. Anyone with the link can open and edit the plan. The API stores sessions in SQLite locally and Firestore on Cloud Run. It reads plans saved by the earlier server using their original session IDs.

### Deadline reminders

`/api/reminders` and `backend/app/reminders.py` are plain code on the deterministic plan, with no model involved.

- You get one email 7, 3 and 1 days before a task's date. Someone who joins two days before a deadline gets one email instead of three.
- Tasks marked done send nothing. A missed deadline sends one note.
- The address is confirmed first by a link in an email (double opt-in). It is kept apart from the plan and removed on unsubscribe. Every email has an unsubscribe link and header.
- A daily job (`/api/reminders/run`) recomputes each plan from the stored session, so dates in emails always match the app. The endpoint stays closed unless `CRON_SECRET` is set. Cloud Scheduler calls it once a day.
- Mail goes through Resend (`RESEND_API_KEY`, `MAIL_FROM`). The development server saves messages under its local `.data/outbox/`.
- Sessions and subscriptions live in Firestore on Cloud Run and in `.data/` locally (`backend/app/sessions.py`, `backend/app/reminder_store.py`).

### Where AI is used

1. **Intake.** Free text in any language, or a photo of a license, insurance card or lease, becomes profile fields through structured output. The result passes the same schema as any other profile, field by field, and the user reviews it before a plan is built. Without a key, a built-in parser handles text in English and common Russian wording.

   In the guided chat, code decides which question comes next from the empty profile fields (`web/src/lib/intake/flow.ts`). Quick-reply buttons answer without a network call. The model only reads each free-text reply or photo into fields, so it cannot invent a question or a rule.

2. **Explanations.** The assistant answers from a curated set of 51 official texts for Texas, California, Florida, Washington and New York (licenses, registration, insurance, tax residency, schools, rental deposits, voting). Retrieval is hybrid: 70% cosine similarity on Gemini `gemini-embedding-001` vectors plus 30% normalized Okapi BM25. The server retrieves up to six passages, filters by jurisdiction, and gives them to the model with the deterministic plan.

   Answers cite passages as `[S1]`, and the server supplies the links. An answer with a missing or invented citation is discarded and the retrieved excerpts are shown instead. No relevant evidence means no model call. See `backend/data/rag/README.md` for coverage, provenance and refresh commands.

3. **Documents.** Letters are built from templates and the user's inputs. On request, the model rewrites a letter for tone and extra details. It is told not to add legal claims, deadlines or amounts, and leaves a `[placeholder]` instead. Without a key the template is the letter.

The profile is sent to the assistant only when the user has switched sharing on. Names and addresses typed into letters stay in the browser and are sent to the model only when the user presses "Tailor with AI".

## API

All endpoints take and return JSON. Interactive docs are at http://127.0.0.1:8000/docs while the backend runs.

| Endpoint | What it does |
|---|---|
| `POST /api/plan` | The checklist for a profile: tasks with deadlines, dependencies and sources. |
| `POST /api/documents/notify` | Who to tell about the move, as a list and as plain text. |
| `GET /api/rules/sources?ids=` | Official sources behind the given rules. |
| `POST /api/intake` | Reads a description or a document photo into profile fields. |
| `POST /api/intake/chat` | Reads one reply in the guided chat. |
| `POST /api/assistant` | Answers a question from retrieved passages, streamed as JSON lines. |
| `POST /api/documents` | Rewrites a finished letter for tone and added details. |
| `GET`, `PUT /api/session/{id}` | Loads or saves a plan by its anonymous session id. |
| `GET`, `POST /api/reminders` | Check status or request a confirmation email for a saved plan. |
| `GET /api/reminders/confirm` | Confirm an email subscription. |
| `GET`, `POST /api/reminders/unsubscribe` | Turn off reminders from an email or the plan. |
| `GET`, `POST /api/reminders/run` | Run the daily scheduler with its bearer secret. Add `?dry=1` to preview. |
| `GET /api/health` | Liveness check. |

## What is verified, and what is not

The rule base has 28 rules: 23 with a checked source and 5 honest gaps (`verified: false`).

| Area | States with checked rules |
|---|---|
| Vehicle (license, registration, insurance) | California, Texas, Florida, Washington, New York |
| State taxes | California, New York |
| Schools | California |
| Federal (IRS address, estimated taxes, Marketplace, Medicaid) | Nationwide |

Other states fall back to a Needs verification task that points to the official agency.

The deadlines and amounts in the rules were checked on 2026-11-14 against search results restricted to the official domains. Most of these sites refuse automated access, so the pages themselves were not opened one by one. Before a public launch, open each `source_url` in a browser and confirm the wording. `last_verified` is the field to update.

Known limits:

- The forecast is an estimate for one W-2 earner with standard deductions. Local taxes, benefits, dependent credits, childcare, debt and savings need the user's own figures.
- No fee table. Agency fees could not be verified from the build environment, so the cost calculator takes the user's numbers.
- Task dependencies are practical ordering (documents before the DMV visit, insurance before registration), written from the rule text.
- Location is matched with bounding boxes, which overlap near state borders. The user always confirms.
- Civio gives general information. It is not legal, tax or insurance advice.

## Pricing

| Plan | Price | What it adds |
|---|---|---|
| Free | $0 | Full plan, assistant, cost calculator, who-to-notify list, deadline reminders |
| Move Pack | $19 per move | Letters filled from the profile, AI tailoring, copy/download/print |
| Civio Watch | $5 per month | Planned: saved plans for repeat movers, rule-change notices |

Checkout is a demo: "Unlock Move Pack" flips a flag and charges nothing. Civio Watch is not built, and its price is a placeholder.

## Stack

**web/**: React 19, Vite, React Router, TypeScript, Tailwind CSS 4, Astryx (`@astryxdesign/core` with the neutral theme, recolored to Civio's palette), GSAP for landing reveals, lucide icons, Vitest.

**backend/**: Python 3.12, FastAPI, Pydantic, Gemini over REST or the Anthropic SDK, SQLite and Firestore for sessions and subscriptions, pytest.

<details>
<summary>Where Astryx is used</summary>

Layout and visuals are Tailwind. Astryx supplies the interactive pieces that are hard to get right by hand:

| Component | Where |
|---|---|
| `Drawer`, `DrawerHeader` | Assistant side panel (focus handling, Escape, scrim) |
| `Markdown`, `Citation` | Assistant answers; a citation like `[S1]` becomes a link to its official source |
| `CommandPalette` | Ctrl/⌘ K on the dashboard: jump to a task or run an action |
| `AlertDialog` | Confirmation before "Start over" clears the plan |
| `useToast` | "Marked as done" with Undo |
| `Tooltip` | Why a task needs verification |
| `Selector` | Searchable state pickers in the questionnaire |
| `Switch` | Profile sharing with the assistant |

The CSS layer order in `web/src/app/globals.css` follows the Astryx + Tailwind example; the overrides at the end of that file keep Civio's typefaces and text colors.

</details>

## Deploy on Google Cloud Run

The Dockerfile builds the Vite frontend and serves its files and the FastAPI routes on the same port. On Cloud Run the container's disk is wiped on restart, so sessions and reminder subscriptions are stored in Firestore. Firestore is chosen automatically when `K_SERVICE` is set, or with `STORE=firestore`.

```sh
# once per project
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
gcloud firestore databases create --location=us-central1 --type=firestore-native
printf '%s' "$GOOGLE_API_KEY" | gcloud secrets create google-api-key --data-file=-
printf '%s' "$(openssl rand -hex 24)" | gcloud secrets create cron-secret --data-file=-
# let the service account read the secrets and use Firestore (roles/secretmanager.secretAccessor, roles/datastore.user)

# deploy (builds the image with Cloud Build)
gcloud run deploy civio --source . --region us-central1 --allow-unauthenticated   --max-instances 3 --memory 512Mi   --set-secrets GOOGLE_API_KEY=google-api-key:latest,CRON_SECRET=cron-secret:latest   --set-env-vars APP_URL=https://civio-<PROJECT_NUMBER>.us-central1.run.app

# daily reminders
gcloud scheduler jobs create http civio-reminders --location us-central1 --schedule "0 15 * * *"   --uri https://civio-<PROJECT_NUMBER>.us-central1.run.app/api/reminders/run --http-method GET   --headers "Authorization=Bearer $(gcloud secrets versions access latest --secret cron-secret)"
```

For emails add `RESEND_API_KEY` and `MAIL_FROM` as secrets or env vars.
