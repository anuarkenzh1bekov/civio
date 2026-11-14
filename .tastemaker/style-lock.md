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
