# Safethrift public marketing design system

Approved direction: contemporary cooperative editorial identity. This is presentation
work on the existing five public routes, not a new roadmap milestone or service launch.

## Research and authority

UI UX Pro Max instructions: `.agents/skills/ui-ux-pro-max/SKILL.md`.
Phase A used `cooperative finance editorial trust --design-system`, focused finance
colour and editorial typography searches, Next.js stack guidance and focus visibility.
Implementation review used `orphan heading line balance --domain ux`: bound the
measure, use natural/balanced wrapping and verify fallback; avoid forced line breaks
throughout headings. The model and invitation have limited intentional editorial breaks.

This master records the approved, curated result. Generic dataset recommendations
for security badges, proof metrics, sales forms, logo carousels and navy/gold branding
were rejected because they conflict with the product stage and approved identity.
The dataset's Newsreader editorial suggestion and Source Sans 3 readable interface
suggestion were combined deliberately; this is not an unchanged generated preset.

References:

- Co-operatives UK: https://www.uk.coop/understanding-co-ops/what-co-op/co-op-values-and-principles
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Newsreader: https://github.com/productiontype/Newsreader
- Source Sans: https://github.com/adobe-fonts/source-sans
- Installed Next.js font/CSS guides were read before implementation.

## Scope and containment

`MarketingSite` wraps only `/`, `/about`, `/products`, `/membership`, and
`/knowledge-centre`. New components live in `src/components/public-site`.
No edits to legacy `marketing.tsx`, registration's `PageHero`, root layout,
shared navigation behaviour, global CSS, dashboard, API or financial controls.

Page tokens are scoped to `.marketing-site`. Root/chrome tokens and styling use
`body:has(> main > .marketing-site)`, and cease matching when marketing content is
removed. New `m-` selectors are reserved for marketing components. Do not move
them into global element selectors. Retain original protected-route fallbacks.
The stylesheet may remain resident after client navigation; its presence must not
restyle registration or protected content. A resident-stylesheet boundary probe is
part of the verification evidence.

## Tokens

| Role                  | Value                                                           |
| --------------------- | --------------------------------------------------------------- |
| Primary/evergreen     | #163B32                                                         |
| Background/warm paper | #F5F2EA                                                         |
| Reading ink           | #202C28                                                         |
| Muted text            | #55635D                                                         |
| Editorial accent/clay | #9D452F                                                         |
| Sage surface          | #E5EAE2                                                         |
| Decorative stone      | #DDD6C8                                                         |
| Decorative rule       | #B8BEB2                                                         |
| On-primary            | #FFFFFF                                                         |
| Reading/UI family     | Self-hosted Source Sans 3, Arial, sans-serif                    |
| Display family        | Self-hosted Newsreader, Georgia, serif                          |
| Body                  | 18px at standard browser settings; line-height 1.6              |
| Hero                  | 52–98px responsive; mobile/medium override; line-height .99     |
| Other page h1         | 40–72px responsive; line-height 1.08; max 18ch                  |
| Section h2            | 34–56px responsive; max 22ch                                    |
| UI radius             | 2px                                                             |
| Spacing units         | 8, 16, 24, 32, 48, 64px                                         |
| Section rhythm        | clamp(56px, 7vw, 104px)                                         |
| Content width         | max 1240px, responsive gutters                                  |
| Focus                 | 3px outline, 5px offset; contrasting treatment on dark sections |
| Motion                | 160ms colour/background response; removed with reduced motion   |

Colour roles are semantic; decorative borders are not control boundaries. Dark
sections use paper text and light focus rings. Use no gradients, fake data,
performance metrics, stock member portraits, approval seals or floating dashboards.
Typography, composition and explanatory diagrams provide the identity.

## Page compositions

- Home: asymmetric introduction/model; purpose split; product comparison rows;
  evergreen cooperative responsibility; learning index; two-column FAQ; invitation.
- About: editorial introduction, narrow mission/vision narrative, six principles,
  three proposed governance roles, concise unconfirmed organisational facts.
- Products: anchored account index, three consolidated account sections, before-launch
  disclosure, proposed Savings Points explanation, quieter future-concept list.
- Membership: status introduction, purpose, paired participation/responsibility lists,
  fees awaiting approval, vertical future journey, closed-registration notice, FAQ.
- Knowledge Centre: editorial introduction, four planned categories, learning context.
  No fictitious article cards, authors, dates, downloads, search or filters.

## Content and accessibility constraints

Read product definitions from the unchanged `src/lib/content.ts`. Preserve six
existing FSA/RSA/GSA overview/detail anchors, governance/materials/how-it-works
anchors, route metadata, publication controls and the shared legal disclosures.
No public collection form, waiting list, signup link or financial execution path.

Native details/summary FAQ; original keyboard-aware mobile navigation; one h1;
semantic ordered lists and definition lists; no essential decorative icons; keyboard
focus and reduced motion. Test 320, 375, 390, 768, 1024, 1440 and 1920 CSS pixels.
Check font loading and reflow at 640 CSS pixels / 2x scale as a desktop 200%-zoom
layout equivalent. This does not replace manual browser zoom or assistive-technology QA.

WCAG 2.2 AA is the target. Automated axe/contrast results are bounded evidence,
not certification. Keep full manual screen-reader and physical-device review explicit.
