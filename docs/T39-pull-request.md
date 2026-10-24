# feat(web): T39 public marketing website and UI/UX refinements

Draft technical review for `main` ← `feat/t39-public-marketing-website`. Commit, feature-branch push and draft PR creation are authorised. Merge, deployment, public launch and enabling indexing are not authorised.

Safethrift previously had a name-and-tagline placeholder. This change implements and refines five static public pages that explain the proposed cooperative while clearly identifying unavailable services. The finished design keeps the dark green, cream and sage identity, improves mobile readability, and gives the products a coordinated, comparable presentation.

## Summary

Implementation of the Safethrift public marketing website with five static public pages, shared responsive components, and refined UI/UX.

## Features

Includes responsive header/footer, enhanced FSA/RSA/GSA showcase, improved four-step savings journey, SEO/social metadata, accessibility improvements and a branded 404 page.

## Resulting experience

- `/`: refined hero retaining “Small savings. Shared strength. Greater possibility.”; decorative growth artwork; connected four-stage model; product showcase; inclusion/governance/responsibility value cards; membership and Knowledge Centre introductions; FAQs and CTA.
- `/about`: contrasting mission/vision panels, numbered values, proposed governance journey and honest team/opportunity placeholders.
- `/products`: reusable FSA/RSA/GSA comparison cards with coordinated icon panels, audience, exact source purpose statements, proposed benefits, status and working detail links. Separate anchored detail sections and clearly planned roadmap concepts.
- `/membership`: benefits/responsibilities, fee-approval panel, informational three-stage membership journey and FAQs. No application or payment facility.
- `/knowledge-centre`: four named resource categories with line icons and coming-soon status. No fictional resources or downloads.

All primary body copy is 16px or larger. Tablet product cards use a horizontal composition; small screens stack them. Header active states, touch targets, footer disclosures, hover and keyboard focus are polished. The header remains the only Client Component; native disclosures and semantic ordered journeys require no extra JavaScript.

## Technical review fixes

- Replace ambiguous decorative Unicode glyphs with SVG/CSS; give illustration labels solid backgrounds and clear stacking. Capture exact axe nodes, text contrast measurements and interaction styles rather than saving only finding IDs. No rule suppression.
- Use a two-colour keyboard focus treatment that remains visible on light and dark sections.
- Remove the localhost metadata base. Without `SITE_URL`, omit canonical, Open Graph URL/image and Twitter image fields; retain text metadata with a summary card. Move image generation to an ordinary static route at the same `/opengraph-image` URL so file-convention metadata cannot inject a fallback origin.
- Verified HTTPS `SITE_URL` yields absolute canonical/social URLs and all five sitemap entries. Invalid origins and loopback hosts are rejected. Indexing still requires `SITE_INDEXING_ENABLED=true` and defaults off.
- `.nvmrc` selects supported Node 22 LTS; CI reads that file. This replaces the end-of-life Node 20 line without changing Next.js, React, Prisma or pnpm versions. Local checks use Node 22.21.1 / pnpm 10.33.0; deployment runtime has not been changed.

## Verification and evidence

See the final [T39 report](T39-report.md) for exact commands, results, full file inventory, measured contrast ratios, Lighthouse results and limitations. [Browser evidence](T39-browser-results.json) records the final seven-width matrix, exact findings, measured solid-background contrast and keyboard/interaction checks. [Baseline contrast evidence](T39-contrast-baseline.json) identifies the original uncertain elements.

The production tests cover all public routes, internal links/anchors, service boundaries, canonical/social metadata, robots, sitemap, share-image output, 404 and linked assets. Unit tests cover development, preview, production, publication approval and invalid URL configuration. CI builds the site and runs its production tests; hosted GitHub Actions results are separate from local results and must be checked on this draft PR.

Updated screenshots for **all five pages** at desktop and mobile widths are linked in the report. The original homepage pair is retained for comparison.

## Publication dependencies and scope

Approve brand/copy, official domain, legal structure, organisational/regulatory facts, governing documents, director/team details, final account and membership terms, fees and legal notices. Proposed £30/£50 membership amounts remain withheld. All products/resources remain unavailable; no authorisation or deposit-protection assurances are made.

T39 only. No T40 registration, T41 dashboard, T42 loan UI, T43 admin UI, authentication, financial backend functionality, API business logic, KYC/payment, schema/migration or ledger changes. No external trackers, analytics, forms or cookie banners.

## Reviewer checklist

- [ ] Review all five pages and desktop/mobile screenshots.
- [ ] Review product comparison, detail anchors and planned-service wording against source copy.
- [ ] Review contrast evidence, keyboard interaction and remaining manual screen-reader limitations.
- [ ] Confirm Node 22 deployment alignment before eventual publication.
- [ ] Approve organisational/legal/product/membership facts and brand/copy.
- [ ] Confirm the official domain and approved legal notices.
- [ ] Approve publication before enabling indexing.
- [ ] Independently review hosted GitHub Actions on this draft PR before any merge approval.

## Publication restrictions

The organisation and financial services are still in development. Legal and regulatory statements require approval. Product terms and membership fees are not approved. `SITE_INDEXING_ENABLED` remains disabled by default; the final local production build is non-indexable. No deployment or public launch is authorised.

## Screenshots

Paths resolve to this feature branch so images render in GitHub PR Markdown. All ten current screenshots and the original homepage comparison pair are included in `docs/screenshots`.

| Page | Desktop | Mobile |
| --- | --- | --- |
| Homepage | [Desktop](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-home-desktop.png) | [Mobile](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-home-mobile.png) |
| About Us | [Desktop](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-about-desktop.png) | [Mobile](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-about-mobile.png) |
| Products & Services | [Desktop](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-products-desktop.png) | [Mobile](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-products-mobile.png) |
| Membership | [Desktop](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-membership-desktop.png) | [Mobile](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-membership-mobile.png) |
| Knowledge Centre | [Desktop](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-knowledge-centre-desktop.png) | [Mobile](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-knowledge-centre-mobile.png) |

![Homepage desktop](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-home-desktop.png?raw=true)

![Products mobile](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/screenshots/t39-products-mobile.png?raw=true)

## Final local verification — 24 October 2026

| Check | Actual local result |
| --- | --- |
| `pnpm install --frozen-lockfile` from root | PASS; all four workspaces, lockfile up to date, no install changes |
| `pnpm --filter @safethrift/web typecheck` | PASS |
| `pnpm --filter @safethrift/web lint` | PASS |
| `pnpm --filter @safethrift/web build` | PASS outside sandbox; every public route static. Initial sandbox attempt failed on Turbopack worker port permissions, not application compilation |
| `pnpm --filter @safethrift/web test:production` | PASS, 13/13; temporary port 2026 server stopped by script |
| `TEST_BASE_URL=http://127.0.0.1:2039 TEST_ARTIFACTS_DIR=/tmp/t39-pr-final pnpm --filter @safethrift/web test:browser` | PASS, 35/35 route/width combinations |
| axe and measured contrast | Zero violations, zero incomplete findings, zero sampled contrast failures |
| Browser interaction | PASS: mobile navigation, Escape/focus restoration, FAQ keyboard activation, skip link, reduced motion |
| `pnpm --filter @safethrift/api exec tsc --noEmit` | PASS |
| `pnpm --filter @safethrift/api test --runInBand` | PASS, 1 suite / 1 test |
| `git diff --check` | PASS |


Lighthouse (fresh local production homepage): mobile {'performance': 85, 'accessibility': 100, 'best-practices': 100, 'seo': 63}; desktop {'performance': 99, 'accessibility': 100, 'best-practices': 100, 'seo': 63}. SEO reflects intentional noindex; performance remains a local lab result.

See [final verification](https://github.com/safethrift-coop/platform/blob/feat/t39-public-marketing-website/docs/T39-final-verification.md) for exact commands, sandbox limitation, scope audit and remaining manual checks. Hosted GitHub Actions is separate and will be reported from actual PR checks.
