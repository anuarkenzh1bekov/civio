# Style lock — Civio

Established: 2026-11-14. Source: five reference images from the user (warm fintech landing, green pharmacy hero, dark onboarding cards, soft wallet dashboard, knowledge-base sidebar). Palette extracted with `extract_palette.py` from images 1 and 2, then adjusted and verified with `check_contrast.py --matrix`.

## Palette
- Background (paper): #ECE8DD
- Surface: #F7F4EC · Raised (cards): #FFFDF8
- Primary (oxblood): #6B2A27, label #F7F4EC — 9.62:1
- Text: #2A1513 — 14.12:1 on paper · Muted: #6B5A52 — 5.34:1 on paper
- Taupe #8A766A: second tone in display headings only (large text)
- Moss #4B5229 (text, done state) · Moss fill #7D874D (bars, icons; UI-safe only)
- Amber #7A4E0E on #F1E4C8: needs-verification state
- Dark sections: espresso #2C1411, raised #3A1D19, text #ECE8DD, muted #B5A598 (7.24:1)
- Dark mode: not needed. Dark is a section treatment (problem section, onboarding, priorities card), not a theme.

## Color contract
- Never put oxblood, moss or amber text on espresso (all under 3:1). On dark use on-dark, dark-muted or moss fill.
- Moss fill never carries text.
- Hairline borders (#D5CFC0) are decorative; state is carried by fill or text color.

## Typography
- Display: Bricolage Grotesque 500–600, tight tracking, two-tone sentences (ink + taupe)
- Body: Instrument Sans · Data and labels: Geist Mono (dates, rule ids, uppercase section labels)

## Shape language
- Radius: 20px cards, 28px panels, full pills for buttons and badges
- Shadow: soft and low; borders do most of the separation

## Structure
- Landing: long-scroll narrative. hook (split hero + plan card) → problem (dark, real deadline bars) → solution (live rule engine) → proof (task anatomy with source) → close.
- App shell: left sidebar (categories), main column, assistant column on wide screens and slide-over below 1280px.
- Onboarding: dark stage, step list left, one question group at a time.

## Motion
- Landing: GSAP reveals on scroll, 0.7s power3.out, off under reduced motion.
- App: 150–260ms color and opacity transitions, list rows rise 8px with a short stagger.

## Assets
- Logo: constructed mark (open route closing on a point) + Bricolage wordmark. `src/app/icon.svg`.
- Icons: lucide only. No photography or illustration in this pass; visuals are product UI and real rule data.

## Do not
- No invented metrics, testimonials or savings claims.
- No gradients, no emoji icons.

## Revision 2 (2026-11-14): one reference per surface
The user rejected the first pass for leaning on reference 1 only. Each reference now owns a surface:
- Reference 2 → landing hero: green atmosphere panel (CSS, no photo), centered glass pill nav, uppercase headline, glass plan card, white cards on the lower band, "3 steps" section.
- Reference 1 → dark espresso band with deadline bars, two-tone section headings, oxblood accents.
- Reference 3 → onboarding: night #0F0D0D stage, stacked bordered cards, progress dots, lime primary button, option rows with a lime ring, "plan so far" card.
- Reference 4 → dashboard body: mist #F1EFF0 background, white 28px tiles, iridescent rose/lilac/sky/peach accents, donut by module, gradient progress bar.
- Reference 5 → dashboard chrome: sidebar with plan switcher, search, module tree; folder cards per module; tasks as a table.
Module tints: taxes rose, health moss, vehicle sky, family peach. Tints never carry text.

## Revision 3 (2026-11-14): landing hero
The user rejected the green hero and sent four more hero references (dark photographic stage, beige fintech, blue gradient with a pixel field). Common ground taken from them:
- Nav sits on the page, outside the hero frame: logo, three text links, one ink button.
- Hero is a dark rounded stage (`.hero-stage`): near-black olive, one light source top right, a lime dot field in the lower corners. Built in CSS; there is still no photograph.
- Headline in sentence case, weight 400, with one word in Instrument Serif italic (`.serif-accent`). The same accent closes each section heading. This is the user's reference style and overrides the "no italic emphasis" default.
- One white primary button and one outline button. No floating chips, no stat cards in the hero.
- The hero visual is a real screenshot of the dashboard (`public/landing/dashboard.png`, re-capture after dashboard changes).
- A row of agency names under the hero comes from the verified rules' sources.
- The closing call to action reuses the stage.
