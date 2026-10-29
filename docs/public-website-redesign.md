# Safethrift public website — editorial redesign handoff

Date: 29 October 2026. Branch: `main`. Status: implemented and locally verified;
awaiting design/code review. No staging, commit, push or deployment.

## Scope and preservation

Implemented the approved Phase A direction for the five existing public routes.
Next.js 16.2.4, React 19 and Tailwind CSS 4 are preserved. No runtime dependency
was added. No milestone or roadmap was created or changed.

The working tree already contained T38/T42 changes. Its tracked diff was captured
before work and compared after implementation: every preexisting tracked diff is
unchanged. Only the five public pages have new tracked diffs. New files are marketing
presentation components, licensed fonts, design documentation and deliberate public
verification evidence. No API, Prisma, pg-boss, Redis/session, authentication,
registration implementation, dashboard implementation or financial policy was edited.
Existing untracked T42 sources and investigation documentation were left untouched.

The full original T01–T52 source was not present during Phase A. Existing public
requirements, central product definitions, T39 documentation and available milestone
excerpts informed the work. No claim of full original-roadmap reconciliation is made.

## Design implementation

The [approved design master](../design-system/safethrift-public/MASTER.md) records
tokens, UI UX Pro Max research, typography, layout and content constraints.

- Evergreen #163B32; warm paper #F5F2EA; charcoal reading text; clay emphasis.
- Self-hosted Newsreader headings and Source Sans 3 body/UI. Two WOFF2 variable
  Latin subsets total **160,872 bytes** (about 157 KiB), with upstream SIL licences.
  No remote font request at runtime. Fonts and provenance are in `apps/web/public/fonts`.
- Responsive 1240px content grid, controlled reading measures, deliberate section
  rhythm, fine rules and two-pixel control radii. No gradient, stock photography,
  fake dashboard, invented statistics, testimonials or institutional seals.
- Static Server Components for new content; native FAQ disclosures. The existing
  header's navigation, Escape, focus restoration and route-state logic are unchanged.
- Marketing tokens are local to `MarketingSite`; header/footer changes activate only
  under `body:has(> main > .marketing-site)`. Root layout, global CSS, shared legacy
  marketing components and registration's existing PageHero remain unchanged.

The shared footer's content/disclosures remain verbatim, with scoped evergreen
presentation on marketing routes. This retains the explicit absence of confirmed
incorporation/authorisation/deposit protection and of public collection facilities.
Default indexing controls, URL validation, canonical/social metadata helpers,
robots, sitemap, social-image endpoint and all route metadata exports are unchanged.

## Page delivery

| Route               | Final presentation                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                 | Asymmetric serif introduction paired with the documented four-stage proposal; inclusion/purpose; FSA/RSA/GSA comparison rows; evergreen governance; resource index; FAQ; development-aware invitation. |
| `/about`            | Editorial introduction, mission/vision narrative, six numbered principles, proposed governance roles, unconfirmed team/vacancy information and FAQ.                                                    |
| `/products`         | Anchored index; consolidated account purpose/approach/benefit/terms; Savings Points context; subdued future-concept list. Removes duplicated card/detail presentations.                                |
| `/membership`       | Status-first introduction, participation/responsibility lists, unconfirmed fees, vertical future journey, explicit closed-registration notice and FAQ.                                                 |
| `/knowledge-centre` | Reading-led introduction and four planned resource categories with honest unpublished status; no fabricated articles, downloads, dates, authors, search or filters.                                    |

Product data is read from unchanged `src/lib/content.ts`. The six existing product
overview/detail anchors, governance, materials and how-it-works destinations remain.
Membership does not guarantee financial access. Approved rates, charges, eligibility,
fees, authorisation or launch dates have not been invented. Public pages contain
no collection forms or links into signup/financial execution paths.

## Iteration and visual inspection

Homepage desktop/mobile renders were inspected before extending the other pages.
That review corrected a legacy closing-copy colour and mobile line-break spacing.
All five pages were then inspected at 390px and 1440px. Secondary page headings
were reduced from the initial exploration to a 40–72px range, improving wrapping,
particularly the Knowledge Centre title. Font files were reduced from full TTFs to
compact WOFF2 subsets before the final build and full matrix.

The final screenshots are persistent review artifacts:

| Page             | Desktop, 1440px                                                   | Mobile, 390px                                                   |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Home             | [Desktop](screenshots/public-editorial/home-1440.png)             | [Mobile](screenshots/public-editorial/home-390.png)             |
| About            | [Desktop](screenshots/public-editorial/about-1440.png)            | [Mobile](screenshots/public-editorial/about-390.png)            |
| Products         | [Desktop](screenshots/public-editorial/products-1440.png)         | [Mobile](screenshots/public-editorial/products-390.png)         |
| Membership       | [Desktop](screenshots/public-editorial/membership-1440.png)       | [Mobile](screenshots/public-editorial/membership-390.png)       |
| Knowledge Centre | [Desktop](screenshots/public-editorial/knowledge-centre-1440.png) | [Mobile](screenshots/public-editorial/knowledge-centre-390.png) |

Before-design evidence remains in the existing `docs/screenshots/t39-*.png` files;
these were not overwritten. Final evidence uses the production build, without the
Next development indicator seen in preliminary renders.

## Verification results

| Check                                                              | Actual result                                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web TypeScript (`node node_modules/typescript/bin/tsc --noEmit`)   | PASS                                                                                                                                                  |
| Full web ESLint (`node node_modules/eslint/bin/eslint.js`)         | PASS                                                                                                                                                  |
| Production build (`node node_modules/next/dist/bin/next build`)    | PASS; five marketing routes remain static                                                                                                             |
| Existing production regression (`node tests/production-check.mjs`) | PASS, **41/41**; public routes, links/anchors, SEO/crawl controls, assets, closed registration/dashboard, session/schema/runtime checks               |
| Public browser matrix (`node tests/browser-check.mjs`)             | PASS, **35/35**: five routes at 320, 375, 390, 768, 1024, 1440 and 1920px                                                                             |
| Axe WCAG A/AA/2.1/2.2 AA tags                                      | **0 violations, 0 incomplete findings** across the matrix                                                                                             |
| Additional rendered text contrast measurement                      | **0 failures**; minimum sampled ratio **5.17:1**                                                                                                      |
| Keyboard/navigation                                                | PASS: menu, Escape/focus restoration, active link, FAQ Enter activation, skip link and visible button focus                                           |
| Reduced motion                                                     | PASS; smooth scroll disabled and transitions removed                                                                                                  |
| Font loading/reflow                                                | PASS on all five routes at 640 CSS px / 2x scale, a desktop 200%-zoom layout equivalent                                                               |
| Protected default presentation                                     | **12/12 identical** before/after computed-style/geometry snapshots: register, login, verify-email, dashboard, loans and loan-review at 390/1440px     |
| Resident marketing stylesheet boundary                             | PASS: replacing marketing content while retaining its stylesheet restores original body/header presentation                                           |
| T40 browser fixture                                                | PASS: individual/family journeys, verification/login, household clearing, receipt recovery, keyboard, mobile, axe and memory-only storage             |
| T41 browser fixture                                                | PASS: authenticated dashboard/history, disabled gates, uncertain replay, fixture-only synthetic savings mutations, GSA, pending state, mobile and axe |
| T42 browser fixture                                                | PASS: owned loan pages, disabled forms, history pagination, reviewer snapshots, member denial, mobile and axe                                         |
| Git whitespace/index                                               | PASS; index empty                                                                                                                                     |

Public matrix/interaction measurements are retained in
[public-website-browser-results.json](public-website-browser-results.json).
Additional reflow/font/boundary and protected snapshot summaries are in
[public-website-boundary-results.json](public-website-boundary-results.json).
Computed-style comparisons cover visible elements' typography, colours, backgrounds,
position and dimensions; they are not a claim of identical authenticated fixture data.

T40/T41/T42 fixtures ran **sequentially**, using a new local
`safethrift_marketing_browser_test` database on the existing dedicated test PostgreSQL
container and a new temporary loopback-only Redis container on port 55439. Only the
existing eight migrations were applied; no new schema definition/migration was written.
No retained shared database or Redis store was reset. The fixture flags apply only to
isolated local child processes; the production preview retains closed gates. No live
provider integration, lending, repayment or external webhook processing was activated.

An initial T40 launch correctly refused to run without explicit test-service URLs;
it is not counted as a passing journey. PostgreSQL was briefly not ready for an initial
createdb attempt; the existing Prisma deploy command subsequently created the new
named database and applied the existing migrations successfully. Tests used that
new database, not an existing application database.

Transient raw logs are under `/tmp/safethrift-marketing-*.log`. The full default
protected snapshots and additional audit scripts are under `/tmp`; the material
results and public screenshots above are retained in the repository. No logs,
Chrome profiles, fixture member records, build output or temporary preview copies
are added as source artifacts.

## Remaining limitations and recommendation

No unresolved local type, lint, build, public-page, layout, contrast, axe or protected
browser regression remains. Automated checks do not establish full WCAG conformance.
A manual screen-reader audit, real-device/OS testing and hosted performance/CI remain
outside this local verification. The zoom-equivalent layout check is not a claim
of manually testing every browser's zoom UI. A preexisting Next.js development warning
about global smooth-scroll annotation appeared in protected fixture journeys; the
root layout was intentionally unchanged and the tests passed.

The existing T38 worker-test ownership blocker is untouched and is not resolved by
this redesign. T42 financial execution remains disabled; durable successful repayment
replay and full functional completion remain pending. Marketing review is separate
from any broader repository preservation or operational approval.

Recommendation: ready for design/code review of this scoped public redesign. Review
screenshots and copy before any Git preservation. No publication, indexing approval,
commit, push, deployment or financial-service activation is implied.

## Final inventory and test-service cleanup

This task changed **26 files**: the five public page files; the new
`src/components/public-site/editorial.tsx` and `marketing.css`; five files in
`public/fonts` (two WOFF2 assets, two licences and README); the design master;
this report; the two public verification JSON files; and the ten public screenshots
listed above. These are intentional source/licensing/design evidence assets.
No generated application output, runtime logs or temporary fixture data is included.
New text files and tracked diffs pass whitespace inspection. A bounded private-key,
AWS-access-key, GitHub-token and live-Stripe-key scan found no matches in this inventory.
Both upstream licences retain their full content with trailing whitespace normalised.

T40/T41/T42 fixture processes exited successfully. The temporary Redis container
was stopped and automatically removed; the dedicated PostgreSQL container was
returned to its prior stopped state, retaining the new test database for review.
The local production preview was stopped after all checks. Its process had renamed
itself to `next-server`, so the final stop used the PID confirmed as listening on
port 2035. No preview, fixture or production service is intentionally left running.
The staged index remains empty. No commit, push, deployment or Git preservation.
