# Style lock — Civio

Established: 2026-11-14. Revised the same day four times; this file is the current state.
Colour source: generated in OKLCH (palette "Harbor slate"), not taken from the reference images. The user's references set layout and structure only.

## Palette: Harbor slate
One neutral ramp, one accent ramp, three status pairs. Primitives live in `:root` of `src/app/globals.css` (`--slate-*`, `--slate-d*`, `--harbor-*`, `--green-*`, `--amber-*`, `--red-*`). Components use only the semantic tokens below.

- Neutral `slate`, hue 215, chroma 0.010 (tinted toward the accent so greys and accent read as one family). Dark end `slate-d1…d4` is the stage.
- Accent `harbor`, hue 205, peak chroma 0.10. Calm teal for a trust and money product.
- Status: green (done), amber (needs verification), red (deadline close, money at stake).

| Token | Value | Role |
|---|---|---|
| canvas | #f0f5f7 | page background |
| panel | #e9eeef | subtle surface, tracks, chips |
| card | #ffffff | raised surface |
| line / line-strong | #d4dddf / #b4bcbe | decorative separator / hover border |
| ink | #1a2122 | body and headings |
| ink-muted | #636a6c | secondary text |
| ink-faint | #7a8284 | display-size second tone and decorative icons only |
| brand / brand-hover | #016770 / #00555c | the one filled action of a light view |
| brand-ink | #00555c | links, accent text |
| brand-soft / brand-tint | #dbf2f4 / #bbe3e8 | selected backgrounds / their ring |
| stage / stage-raised / stage-line | #071114 / #101a1d / #2c383b | dark surfaces |
| on-stage / on-stage-muted | #f6fbfd / #b4bcbe | text on dark |
| brand-bright | #5aadb7 | accent on dark: selection rings, checks, bars, focus ring |
| ok, warn, risk (+ -soft) | #0a693c, #7a4d04, #9a2929 | status text on its soft background |
| risk-bright | #f2a49c | error text on the stage |
| mod-taxes … mod-family | harbor 10, 8, 6, 4 | modules, told apart by lightness inside one hue |

## Color contract (measured)
- Text pairs: ink/canvas 14.88 · ink-muted/panel 4.71 (lowest) · on-brand/brand 6.61 · brand-ink/canvas 7.79 · brand-ink/brand-soft 7.34 · on-stage/stage 18.32 · on-stage-muted/stage 9.89 · ok/ok-soft 5.92 · warn/warn-soft 6.25 · risk/risk-soft 6.61.
- UI pairs: brand-bright/stage 7.36 (ring), brand/card 6.61 (fill shows on page).
- Decorative only, never the sole carrier of state: stage-line/stage 1.58, line-strong/card 1.93, ink-faint on canvas 3.6 (large text only).
- One meaning per colour: harbor = interactive or selected; red = time or money at risk; amber = needs verification; green = done. Static labels stay neutral.
- One filled action per view: brand on light surfaces, on-stage (light button) on the stage.

## Astryx
- Theme `@astryxdesign/theme-neutral`; the unlayered `[data-astryx-theme]` block in `globals.css` maps its accent, focus, text, surface and border tokens to Harbor with `light-dark()`, and sets `--size-element-lg: 3rem`.
- Civio token names never reuse an Astryx name (checked against core + theme variable lists).

## Typography
- Display: Bricolage Grotesque; section headings weight 400 with one Instrument Serif italic accent phrase (`.serif-accent`), the user's reference style.
- Body: Instrument Sans · Data and labels: Geist Mono.

## Shape language
- Radius: 20px cards, 28px panels, 32px stage shells, full pills for buttons and badges.
- Shadows tinted with the stage hue, soft and low.

## Structure
- Landing: nav on the page (logo, three links, one brand button) → dark stage hero with sentence-case headline, two actions and a real dashboard screenshot → agency row → three steps → dark band with deadline bars → live rule engine → task anatomy with source → stage closing CTA.
- Onboarding: dark stage, stacked bordered cards, progress dots, light primary button, option rows with a brand-bright ring, "plan so far" card.
- Dashboard: sidebar (plan switcher, search, module tree) → progress, donut, dark "Next up" card → module folders → task table. Assistant in a drawer.

## Motion
- Landing: GSAP reveals on scroll, 0.7s power3.out, off under reduced motion.
- App: 150–260ms colour and opacity transitions, list rows rise 8px with a short stagger.

## Assets
- Logo: constructed mark + Bricolage wordmark, mark in brand. `src/app/icon.svg` matches the brand fill.
- Hero screenshot: `public/landing/dashboard-harbor.png`. Re-capture after any dashboard change and give it a new file name (Next's image cache keys on the URL).
- Icons: lucide only. No photography.

## Do not
- No colours from the reference images. They were for layout only (user, 2026-11-14).
- No second accent hue, no iridescent or pastel multi-hue decoration.
- No raw hex or rgb in components; add a role token instead.
- No invented metrics, testimonials or savings claims. No emoji icons.
