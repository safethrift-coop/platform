# T39 UI/UX refinement and technical review — 23 October 2026

**T39 REFINEMENT COMPLETE — AWAITING REVIEW**

Historical refinement snapshot (23 October 2026); see [final PR verification](T39-final-verification.md) for the subsequent authorised commit/PR preparation. At the time of this refinement, all work remained local and uncommitted on `feat/t39-public-marketing-website`. No commit, push, PR, review request, merge or deployment has occurred. This report describes technical implementation and local verification, not legal approval or a public launch.

## A. Initial review findings

Reviewed the existing Git status, all five pages, shared components, CSS, metadata, tests, existing desktop/mobile homepage screenshots, `T39-report.md`, `T39-baseline.md`, `T39-pull-request.md` and the web README before UI changes. Preserved the uncommitted implementation and stayed on the existing branch. HEAD remains the pre-existing `8cfd0e3`, not a T39 commit. The [original repository baseline](T39-baseline.md) remains historical and unchanged.

The existing identity was sound: dark green, cream, sage, generous space, system fonts and a growth illustration. Findings:

- Product cards relied on large serial numbers and small audience text. They lacked shared purpose/benefit groupings, category illustrations and dedicated detail links on the products page.
- The four-step model had no strong visual connection; mission, governance, membership and resource sections repeated similar text/card compositions.
- Several primary card paragraphs were below 16px; footer disclosures were 12px; mobile cards could use their width more effectively.
- The previous axe evidence retained only `color-contrast` IDs, obscuring exact nodes and reasons. A diagnostic rerun identified decorative glyphs and overlapping/gradient-backed illustration labels.
- `metadataBase` explicitly fell back to localhost. The file-convention Open Graph image could also inject metadata automatically, even if explicit image fields were removed.
- `.nvmrc`/CI used Node 20.20.2 while local checks/browser tests used Node 22.21.1. Node 20 meets engine minimums but is end-of-life on the review date.

## B. UI/UX improvements, by page

| Page                                 | Before                                                                                                 | After and implementation                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home `/`                             | Large hero, tall mobile illustration, disconnected numbered steps, plain product/value columns.        | Preserves the exact hero message and decorative growth concept; rebalances typography, CTA hierarchy and mobile illustration height. Adds a semantic connected four-stage journey, coordinated product cards and framed value propositions with a consistent line-icon system. Desktop product comparison rows align. See `page.tsx`, `Journey`, `ProductCards` and shared CSS.                                                                 |
| About `/about`                       | Mission, vision and team sections shared a generic card treatment; governance was three plain columns. | Contrasting mission/vision panels, numbered editorial value cards, a three-stage proposed governance presentation and clear team/vacancy information states. No fictional appointments or people.                                                                                                                                                                                                                                               |
| Products `/products`                 | Serial-number cards; important information was visually undifferentiated.                              | Coordinated sage, cool-green and warm-cream icon panels distinguish FSA/RSA/GSA. Every card includes abbreviation, full name, audience, exact source purpose, proposed benefit, coming-soon status and a real detail link. Semantic definition lists make facts comparable; anchored detail sections provide the existing longer explanation and final-terms notice. Tablet cards become horizontal; mobile cards stack with full usable width. |
| Membership `/membership`             | Fees and a small process list competed inside two cards.                                               | Balanced benefits/responsibilities, a dedicated fee-status panel and a full-width three-stage informational journey. Application and payment functions remain unavailable; this is not T40.                                                                                                                                                                                                                                                     |
| Knowledge Centre `/knowledge-centre` | Numbered placeholder cards.                                                                            | Four recognisable category icons, coordinated cards, clear headings/status and a consistent “Materials in development” footer. No fake articles, downloads or disabled-action bait.                                                                                                                                                                                                                                                             |

Across all pages, primary body copy is at least 16px, body line height is comfortable, large headings scale fluidly, secondary heroes are more compact, card spacing is more consistent, and navigation/footer links have generous targets. The footer separates exploration, principles and development disclosures. Active navigation is clearer; the mobile expanded state, Escape behavior and focus restoration are preserved.

Reusable static components remain in `src/components/marketing.tsx`; new decorative SVG primitives are in `src/components/icon.tsx`. The header is still the only Client Component. Hover/pressed/focus treatments use CSS; reduced motion disables transitions and smooth scrolling. No new package, tracker, analytics script, form or cookie banner was introduced during this refinement.

### Visual comparison and regression review

Retained the original homepage screenshots as `t39-before-home-desktop.png` and `t39-before-home-mobile.png`. Compared the new homepage against these and inspected all five final pages at desktop/mobile widths. The original green/cream identity and content boundaries remain. Product information is now grouped and legible, journeys read in sequence, and secondary pages have distinct but coordinated compositions.

Visual review corrected a tablet/mobile double-padding issue in product cards, an illustration-caption overlap, and desktop comparison-row alignment. Automated browser checks cover all seven widths. No layout, link, keyboard or automated accessibility regressions remain in the verified matrix. Manual screen-reader evaluation and real-device/touch testing remain outside the measured evidence.

## C. Accessibility findings and measurements

[Exact baseline findings](T39-contrast-baseline.json) retain selectors, HTML, axe messages, related nodes and check data from the pre-refinement 1440px pages.

| Original element(s)                                                                                        | Cause                                                                                                                             | Correction and evidence                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.hero-caption > span`, `.status > span`, arrow spans in `.text-link`, product links and the “voice” glyph | axe classified standalone decorative circle/arrow characters as non-text (`nonBmp`), so it could not give a text contrast result. | Replace status/caption circles with CSS rings and arrows/value/resource/product symbols with decorative SVG. Adjacent actual text remains labelled and audited. No rule is disabled or excluded. |
| `.label-top`                                                                                               | Layered orbit/growth elements caused axe `bgOverlap`.                                                                             | Explicit opaque sage text backing and corrected stacking. The label is purely decorative; its visible text is nevertheless measured at **9.90:1**.                                               |
| `.label-bottom`                                                                                            | The underlying decorative grid uses gradients; axe returned `bgGradient`.                                                         | Opaque text backing, clear placement below the inset card, and decorative semantics. Same **9.90:1** measurement.                                                                                |
| Generic product detail container introduced during refinement                                              | An `aria-label` on a generic `div` was not supported.                                                                             | Use a named semantic `section`; final axe evidence contains no incomplete finding.                                                                                                               |
| Focus outline on mixed light/dark backgrounds                                                              | A single coloured outline could lose contrast on a dark section.                                                                  | 3px dark outline, 4px offset, surrounded by a 10px cream ring. Dark/cream contrast is **11.35:1**. Actual focus styles and `:focus-visible` state are recorded.                                  |

Measurements use the WCAG sRGB relative-luminance formula. The browser reads actual foreground/font styles and alpha-composites ancestor background colours. Text surfaces are solid; decorative illustration labels now have explicit solid backing. This is not a general pixel sampler for arbitrary images or occluded content; screenshots were also reviewed.

| Text/interface treatment                         | Foreground / background          | Ratio            | Applicable threshold |
| ------------------------------------------------ | -------------------------------- | ---------------- | -------------------- |
| Primary text / links / qualifying large headings | `#173e32` / `#fbfaf6`            | 11.35:1          | 4.5 normal / 3 large |
| Muted body / footer text                         | `#526359` / `#fbfaf6`            | 6.12:1           | 4.5                  |
| Muted text on tinted sections                    | `#526359` / `#edf1e8`            | 5.58:1           | 4.5                  |
| Muted text on vision panel                       | `#526359` / `#e2ead7`            | 5.17:1           | 4.5                  |
| Primary button                                   | `#ffffff` / `#173e32`            | 11.85:1          | 4.5                  |
| Primary button hover                             | `#ffffff` / `#2f5845`            | 8.07:1           | 4.5                  |
| Secondary button hover                           | `#173e32` / `#edf1e8`            | 10.36:1          | 4.5                  |
| Closing CTA default / hover                      | `#173e32` / `#d6ed9e`, `#e6f4c5` | 9.30:1 / 10.22:1 | 4.5                  |
| Product coming-soon text                         | `#3f5935` / `#fffefa`            | 7.73:1           | 4.5                  |
| Expanded mobile toggle                           | `#fbfaf6` / `#173e32`            | 11.35:1          | 4.5                  |
| Decorative label text                            | `#173e32` / `#e7eddc`            | 9.90:1           | 4.5                  |
| Applicable menu border against page              | `#6b7e67` / `#fbfaf6`            | 4.18:1           | 3 non-text           |
| Focus outline against cream surround             | `#173e32` / `#fbfaf6`            | 11.35:1          | 3 non-text           |

The final [browser results](T39-browser-results.json) contain all rendered style samples and interaction colours, not just these representative pairs. Zero text samples failed the relevant threshold. Final matrix: **35 combinations; zero axe violations; zero incomplete findings; no horizontal overflow.** The minimum sampled text ratio is **5.17:1**. Semantic landmarks, one h1 per page, skip link, native FAQ activation, mobile menu, Escape/focus restoration and reduced motion are verified. Automated audit results do not constitute full WCAG certification; manual screen-reader, zoom/user-styles and real assistive-technology review remain unperformed.

## D. Technical fixes and rationale

### Node.js, package engines and CI

Reviewed [Node's official release status](https://nodejs.org/en/about/previous-releases), the [release schedule](https://github.com/nodejs/Release#release-schedule), [Next.js 16 system requirements](https://nextjs.org/docs/app/getting-started/installation), [pnpm 10 compatibility](https://pnpm.io/10.x/installation#compatibility), and installed package engines:

| Installed package   | Node engine |
| ------------------- | ----------- | --- | ------ | --- | ------- |
| Next.js 16.2.4      | `>=20.9.0`  |
| React 19.2.4        | `>=0.10.0`  |
| Prisma 7.8.0        | `^20.19     |     | ^22.12 |     | >=24.0` |
| NestJS core 11.1.19 | `>=20`      |

Node 20.20.2 meets those engines but its release line is now end-of-life. Node 22 is Maintenance LTS, supports the existing application/tooling and provides the native WebSocket needed by the browser script. `.nvmrc` now selects `22`; CI uses `node-version-file: .nvmrc`. This intentionally standardises the supported **major line**, allowing current security patches rather than pinning an old patch. Local verification used the already installed **22.21.1**, not a claim to have installed the newest patch. pnpm stays at **10.33.0**. No Next/React/Prisma or backend dependency upgrade was made.

Deployment should use a current Node 22 patch, at least 22.12 for Prisma. No deployment runtime configuration exists in the inspected repository and no hosted runtime was modified. Hosted CI and deployment verification remain NOT RUN. No CI check was weakened or disabled.

### SEO and social metadata

The installed Next.js 16 metadata guide confirms file-based metadata takes priority and relative image fields resolve through a base origin. Consequently, merely removing the explicit localhost base while retaining `opengraph-image.tsx` would be insufficient.

- Remove the localhost fallback in `layout.tsx`.
- Move image generation to ordinary static `app/opengraph-image/route.tsx`, preserving the `/opengraph-image` URL without automatic metadata injection.
- With no approved `SITE_URL`, omit canonical, Open Graph URL/image and Twitter image fields; retain titles/descriptions and Twitter's text summary card. Development and domainless previews work; no localhost social URLs are emitted.
- With an approved HTTPS origin, generate absolute canonical/social URLs and all five sitemap entries. Configured previews remain non-indexable by default.
- Indexing requires both a configured origin and explicit `SITE_INDEXING_ENABLED=true`. Robots remains disallow and metadata remains noindex/nofollow otherwise.
- Reject HTTP, malformed origins, paths, queries, fragments, credentials and loopback/localhost hosts. Environment-provided preview hostnames are not assumed to be verified domains.

Tests cover development, production/preview without an origin, configured previews, approved production and invalid input. A real configured build used reserved `https://approved.example` solely for local tests, then the final default build was restored. Next.js normalises the homepage's trailing slash; the integration test compares parsed URL equality. No Safethrift domain has been invented.

## E. Complete file inventory

The inventory includes the original uncommitted T39 implementation plus this refinement. A file can therefore be listed even when its content did not change during refinement. No unrelated files were overwritten.

| File                                                | Purpose / refinement                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `.nvmrc`                                            | Select supported Node 22 LTS line.                                                                                                     |
| `.github/workflows/ci.yml`                          | Read Node version from `.nvmrc`; retain added web build/production-test checks and all existing checks.                                |
| `apps/web/README.md`                                | Setup, Node/deployment alignment, tests, SEO publication settings and accessibility evidence guidance.                                 |
| `apps/web/next.config.ts`                           | Existing T39 explicit monorepo Turbopack root.                                                                                         |
| `apps/web/package.json`                             | Existing T39 typecheck/test/browser/production scripts and dev-only axe dependency.                                                    |
| `pnpm-lock.yaml`                                    | Existing T39 axe declaration and pnpm normalisation; no refinement package upgrade.                                                    |
| `apps/web/src/app/favicon.ico`                      | Original T39 deletion of the starter Next.js favicon.                                                                                  |
| `apps/web/src/app/icon.svg`                         | Original T39 text-initial browser icon.                                                                                                |
| `apps/web/src/app/globals.css`                      | Refined type/spacing, comparison cards, responsive layouts, journeys, icons, navigation/footer, interaction/focus/contrast treatments. |
| `apps/web/src/app/layout.tsx`                       | Shared landmarks/chrome and safe metadata base configuration.                                                                          |
| `apps/web/src/app/page.tsx`                         | Refined hero, ordered journey, product/value showcase; decorative illustration semantics.                                              |
| `apps/web/src/app/about/page.tsx`                   | Purpose panels, numbered values, proposed governance journey and information statuses.                                                 |
| `apps/web/src/app/products/page.tsx`                | Existing products/roadmap content; presentation upgraded through shared product components.                                            |
| `apps/web/src/app/membership/page.tsx`              | Fee-status panel and clear informational membership journey.                                                                           |
| `apps/web/src/app/knowledge-centre/page.tsx`        | Existing categories/content; presentation upgraded through shared resource components.                                                 |
| `apps/web/src/app/not-found.tsx`                    | Existing T39 branded 404.                                                                                                              |
| `apps/web/src/app/opengraph-image/route.tsx`        | Static ordinary share-image endpoint, moved from the earlier uncommitted file-convention image.                                        |
| `apps/web/src/app/robots.ts`                        | Existing safe crawl policy.                                                                                                            |
| `apps/web/src/app/sitemap.ts`                       | Existing explicitly configured five-route sitemap.                                                                                     |
| `apps/web/src/components/icon.tsx`                  | New small decorative SVG line-icon system.                                                                                             |
| `apps/web/src/components/marketing.tsx`             | Comparison/detail cards, semantic Journey, icon resource cards, refined statuses/actions/footer and existing FAQ/CTA.                  |
| `apps/web/src/components/site-header.tsx`           | Existing T39 active/mobile navigation logic preserved; visual improvements are CSS.                                                    |
| `apps/web/src/lib/content.ts`                       | Existing source-aligned copy, purpose statements, categories, steps and FAQs preserved.                                                |
| `apps/web/src/lib/seo.ts`                           | No implicit social origin; validated HTTPS/loopback handling; explicit image and indexing configuration.                               |
| `apps/web/tests/public-site.test.mjs`               | Eight HTTP tests: routes, links/anchors, content boundaries, conditional metadata, crawl output, PNG/404 and CSS/JS availability.      |
| `apps/web/tests/seo-config.test.mjs`                | Five configuration tests covering development/preview/production, approval and invalid origins.                                        |
| `apps/web/tests/production-check.mjs`               | Existing temporary production server/test orchestration; now runs 13 tests.                                                            |
| `apps/web/tests/browser-check.mjs`                  | Seven-width matrix, exact axe nodes, contrast samples, hover/focus styles, keyboard checks and ten screenshots.                        |
| `docs/T39-baseline.md`                              | Original historical baseline, retained.                                                                                                |
| `docs/T39-report.md`                                | This final A–J report and acceptance matrix.                                                                                           |
| `docs/T39-pull-request.md`                          | Updated local PR description and review checklist.                                                                                     |
| `docs/T39-browser-results.json`                     | Final detailed browser/contrast/interaction evidence.                                                                                  |
| `docs/T39-contrast-baseline.json`                   | Exact original contrast nodes/reasons captured before UI refinements.                                                                  |
| `docs/T39-lighthouse-results.json`                  | Measured final local Lighthouse summary, settings, metrics and remaining audits.                                                       |
| `docs/T39-git-status.txt`                           | Exact final branch and complete tracked/untracked status.                                                                              |
| `docs/screenshots/t39-before-home-desktop.png`      | Original 1440px homepage retained for comparison.                                                                                      |
| `docs/screenshots/t39-before-home-mobile.png`       | Original 390px homepage retained for comparison.                                                                                       |
| `docs/screenshots/t39-home-desktop.png`             | Updated homepage, 1440px.                                                                                                              |
| `docs/screenshots/t39-home-mobile.png`              | Updated homepage, 390px.                                                                                                               |
| `docs/screenshots/t39-about-desktop.png`            | Updated About, 1440px.                                                                                                                 |
| `docs/screenshots/t39-about-mobile.png`             | Updated About, 390px.                                                                                                                  |
| `docs/screenshots/t39-products-desktop.png`         | Updated Products, 1440px.                                                                                                              |
| `docs/screenshots/t39-products-mobile.png`          | Updated Products, 390px.                                                                                                               |
| `docs/screenshots/t39-membership-desktop.png`       | Updated Membership, 1440px.                                                                                                            |
| `docs/screenshots/t39-membership-mobile.png`        | Updated Membership, 390px.                                                                                                             |
| `docs/screenshots/t39-knowledge-centre-desktop.png` | Updated Knowledge Centre, 1440px.                                                                                                      |
| `docs/screenshots/t39-knowledge-centre-mobile.png`  | Updated Knowledge Centre, 390px.                                                                                                       |

The earlier `src/app/opengraph-image.tsx` was untracked; its move will appear in final Git status only as the new route file. Existing starter assets remain preserved apart from the original T39 favicon replacement.

## F. Verification

Commands run from the repository root with Node 22.21.1 / pnpm 10.33.0. Local ports/browser/Next worker operations required execution outside the network-restricted sandbox.

| Command / check                                                                                                                                        | Result                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                       | PASS. Sandboxed registry update lookup initially failed, though installation completed; rerun with registry access passed cleanly. No lockfile/package upgrade during refinement.                                          |
| `pnpm --filter @safethrift/web typecheck`                                                                                                              | PASS.                                                                                                                                                                                                                      |
| `pnpm --filter @safethrift/web lint`                                                                                                                   | PASS.                                                                                                                                                                                                                      |
| `pnpm --filter @safethrift/web build`                                                                                                                  | PASS. Every public route, image, icon, sitemap, robots and 404 is static. Final build has no origin configured and indexing disabled.                                                                                      |
| `pnpm --filter @safethrift/web test:production`                                                                                                        | PASS, **13/13**, including CSS/JS assets.                                                                                                                                                                                  |
| `pnpm --filter @safethrift/web exec env SITE_URL=https://approved.example SITE_INDEXING_ENABLED=true next build`                                       | PASS, local reserved-origin publication configuration.                                                                                                                                                                     |
| `pnpm --filter @safethrift/web exec env TEST_SITE_URL=https://approved.example TEST_INDEXING_ENABLED=true node tests/production-check.mjs`             | PASS, **12/12** at that stage (the linked-asset test was added afterwards and passed in the final default run). Initial root-canonical assertion needed URL normalisation, then passed. Default build restored afterwards. |
| `pnpm --filter @safethrift/web exec env TEST_BASE_URL=http://localhost:2029 TEST_ARTIFACTS_DIR=/tmp/t39-refinement-final node tests/browser-check.mjs` | PASS, **35/35** combinations: all five routes at **320, 375, 390, 768, 1024, 1440, 1920**. No overflow, axe violation, incomplete finding or measured text failure. Keyboard and interaction/focus checks pass.            |
| `pnpm --filter @safethrift/api exec tsc --noEmit`                                                                                                      | PASS; no API source change.                                                                                                                                                                                                |
| `pnpm --filter @safethrift/api exec jest --runInBand`                                                                                                  | PASS, existing **1 suite / 1 test**. This is not a financial-system integration suite.                                                                                                                                     |
| `git diff --check`                                                                                                                                     | PASS.                                                                                                                                                                                                                      |
| Hosted CI / real-device testing / manual screen-reader audit                                                                                           | NOT RUN.                                                                                                                                                                                                                   |
| Commit / push / PR / reviewer request / merge / deployment                                                                                             | NOT RUN, explicitly prohibited by the user.                                                                                                                                                                                |

**Lighthouse 13.5.0**, local production homepage, one default mobile run and one `--preset=desktop` run:

- **Mobile**: Performance **89**, Accessibility **100**, Best Practices **100**, SEO **63**. FCP 1.0 s; LCP 2.5 s; TBT 340 ms; CLS 0.
- **Desktop**: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **63**. FCP 0.3 s; LCP 0.6 s; TBT 50 ms; CLS 0.

Both runs have intentional noindex: the failed SEO audit is `is-crawlable`; its weight lowers the SEO score to 63. No crawl approval was bypassed. Remaining performance opportunities are framework JavaScript execution/unused or legacy code, main-thread work and network dependency/forced-reflow insights. These are recorded in [the summary](T39-lighthouse-results.json); no framework upgrade or unnecessary client library was introduced to chase a score.

Exact command: `pnpm dlx lighthouse http://localhost:2029 --chrome-flags='--headless --no-sandbox --disable-dev-shm-usage' --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=/tmp/t39-lighthouse-mobile-final.json --quiet`; desktop adds `--preset=desktop` and its own output path. Lighthouse was fetched temporarily, not added to the repository dependencies. Full raw reports are retained at `/tmp/t39-lighthouse-mobile-final.json` and `/tmp/t39-lighthouse-desktop-final.json` for this session.

The first Lighthouse attempt was invalidated by a stale running server after a build replaced its CSS files, producing a stylesheet 500. Those scores are discarded. Final runs use a fresh server for the final build, after the browser matrix completes. The added production test verifies linked assets load. Scores are local lab observations, not field data or deployment guarantees. Indexing stays disabled as required; any resulting SEO penalty is recorded, not bypassed to improve a score.

## G. Updated screenshots

| Page             | Desktop (1440px)                                        | Mobile (390px)                                        |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Home             | [Desktop](screenshots/t39-home-desktop.png)             | [Mobile](screenshots/t39-home-mobile.png)             |
| About            | [Desktop](screenshots/t39-about-desktop.png)            | [Mobile](screenshots/t39-about-mobile.png)            |
| Products         | [Desktop](screenshots/t39-products-desktop.png)         | [Mobile](screenshots/t39-products-mobile.png)         |
| Membership       | [Desktop](screenshots/t39-membership-desktop.png)       | [Mobile](screenshots/t39-membership-mobile.png)       |
| Knowledge Centre | [Desktop](screenshots/t39-knowledge-centre-desktop.png) | [Mobile](screenshots/t39-knowledge-centre-mobile.png) |

Before: [original desktop homepage](screenshots/t39-before-home-desktop.png), [original mobile homepage](screenshots/t39-before-home-mobile.png). Final screenshots show the rendered production build and are saved with the verification evidence.

## H. Outstanding approvals and limitations

- Approve incorporation/legal name/structure, organisational and regulatory facts, official contacts/address, director/team biographies, governance documents and member rights. No verified status has been fabricated.
- Approve account/Savings Points descriptions and all eligibility, contribution, withdrawal, charge and support terms before offering services. Source purposes remain intact; no rates or guarantees are invented.
- Approve final membership terms and fees. Proposed £30 individual / £50 family amounts remain withheld from the public pages.
- Supply approved privacy/terms documents appropriate to actual operations before data collection. No draft legal policy is passed off as approved.
- Approve brand identity/copy, roadmap concepts, official domain and publication. Set `SITE_URL` only to an approved HTTPS origin; enable indexing only after explicit publication approval and rebuild.
- Resources, team information and opportunities remain honestly pending. No fake materials or contact channels were added.
- Manual assistive-technology review and production hosting/runtime/CI verification remain outstanding. Browser contrast calculations are documented solid-surface measurements, not certification of every possible user setting.

There are no unresolved local build/test/layout/axe/contrast failures. Hosted review and content/publication decisions remain outstanding. No T40 or later feature, backend, Prisma, auth, financial, KYC or payment change was introduced.

## I. Git status

Branch: `feat/t39-public-marketing-website`. HEAD: `8cfd0e3` (pre-existing implementation base). All T39 source, evidence and documentation changes remain unstaged/uncommitted. The exact full status is saved in [T39-git-status.txt](T39-git-status.txt), generated with `git status --short --branch --untracked-files=all` after completion. Source changes are confined to `.nvmrc`, CI, web, the existing T39 lockfile and documentation. `git diff --name-only -- apps/api packages/prisma` is empty.

No branch creation/reset/stash/discard, commit, push, pull request, review request, merge or deployment was performed in this refinement. The [updated PR description](T39-pull-request.md) is local only.

## J. Final status and acceptance matrix

**T39 REFINEMENT COMPLETE — AWAITING REVIEW**

| Requirement                                                          | Status and evidence                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Preserve original uncommitted work / same branch                     | PASS — initial/final Git status, unchanged HEAD, original baseline and before screenshots retained.                      |
| Five public pages remain functional                                  | PASS — production route/link/anchor tests and browser matrix.                                                            |
| Homepage hierarchy/hero/values improved                              | PASS — refined composition, icon cards, readable type and screenshots.                                                   |
| Product/service presentation substantially improved                  | PASS — comparison cards, distinct coordinated graphics, source facts, status, detail links and responsive layouts.       |
| Four-step model clearer                                              | PASS — semantic connected ordered journey, vertical mobile flow.                                                         |
| About/Membership/Knowledge Centre consistently refined               | PASS — dedicated panels, sequences, category icons and all-page screenshots.                                             |
| Comfortable body type/navigation/footer                              | PASS — primary body 16px+, generous targets, active/expanded states and legible disclosures.                             |
| Required responsive widths including 375px and wide desktop          | PASS — all seven widths, zero overflow.                                                                                  |
| Contrast uncertainty investigated rather than suppressed             | PASS — exact baseline nodes, explicit background/vector corrections and measured ratios; zero final incomplete findings. |
| Keyboard/landmarks/skip/reduced-motion support                       | PASS — browser interactions and semantic implementation.                                                                 |
| No unintended localhost social URLs                                  | PASS — omission without approved origin; absolute HTTPS output with origin; production/configuration tests.              |
| Supported Node/CI alignment and actual engine review                 | PASS locally — Node 22 line in `.nvmrc` and CI; installed engines and official sources checked; hosted CI NOT RUN.       |
| Default indexing disabled / explicit approval / valid sitemap/robots | PASS — metadata, crawl tests and approved-origin build.                                                                  |
| Static production build / website tests                              | PASS — static route output and 13 final tests.                                                                           |
| Existing backend preserved                                           | PASS — no API/Prisma diff; API types and existing unit test pass.                                                        |
| Lighthouse measured or accurately reported                           | See section F and saved evidence; no unmeasured score claimed.                                                           |
| Screenshots/docs/PR description/evidence updated                     | PASS — all ten screenshots, original comparison pair, report, README and JSON artifacts.                                 |
| No T40+ features or publication actions                              | PASS — scope inspection and Git status.                                                                                  |
| Remaining approvals and limitations identified                       | PASS — section H; no claim of launch/legal approval/full WCAG certification.                                             |
