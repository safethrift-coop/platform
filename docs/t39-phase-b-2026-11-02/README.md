# T39 Phase B — approved Direction B implementation

2 November 2026. **READY FOR REVIEW. This is not production release approval.** No staging, commits, pushes, branch changes or deployment. Registration and financial execution remain closed.

## Starting repository audit

- Branch: `main`; HEAD: `980b1db12a311bd7cf909b4cff64d04317b5d73f`. Actual value was checked, not assumed.
- Index and tracked working-tree diff were empty. Existing untracked material was only the original and refined prototype trees under `docs/design-prototypes/`; preserved unchanged.
- The mentioned unrelated ignore modifications were not present in starting Git status. All four tracked `.gitignore` files were hashed and remain untouched.
- Both accepted local commits are ancestors of HEAD: `cd03d8bdcc0538a8a7524298ed1a81b70d3819cf`, `03793f3843714849a811752577fdae42b2a77a13`.
- Approved T38 target is `apps/api/test/payment-webhooks.integration.test.mjs`, SHA-256 `9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a`. The similarly named webhook unit spec is a different file. The approved integration target is unchanged.
- Read all five public routes, editorial helpers, shared header/footer consumers, layout and stylesheet contracts, public content and SEO exports, font licences, package scripts, T39 tests, protected fixture guards and isolated-browser helpers. Read installed Next.js CSS/font guidance, including persistent stylesheets during client navigation.
- Inspected approved Home/Products screenshots, interaction board, prototype source, README and DESIGN-REVIEW, plus responsive captures. Used the installed `ui-ux-pro-max` skill and focused text-resize/reflow guidance. No new design direction or dependency was introduced.

Baseline file hashes and exact status are retained in [baseline.json](baseline.json).

## Exact implementation-file scope

Modified:

1. `apps/web/src/app/page.tsx` — approved Home composition and proposal copy, semantic sections, focusable anchor destinations, real public links.
2. `apps/web/src/app/products/page.tsx` — approved comparison/account narratives, conditional Points, common launch checklist, separated concepts and preserved product anchors.
3. `apps/web/src/components/public-site/editorial.tsx` — remove the two obsolete Home-only presentation helpers and their unused imports; retained secondary-page component contracts and content.
4. `apps/web/src/components/public-site/marketing.css` — public typography/tokens, approved scoped compositions, responsive states and scoped shared-chrome treatment. Removed unused legacy rules and duplicate font declarations.
5. `apps/web/tests/browser-check.mjs` — **three T39 verification selectors only**. The prior design's two hero buttons and closing button became the approved hero text link, participation-motif link and closing information button. All assertions, viewport checks, contrast logic and fixture behaviour are unchanged. This is a necessary T39 verification-artifact update, not a protected-suite change. See [exact diff](browser-harness-adaptation.diff).

New implementation/assets:

6. `apps/web/src/components/public-site/graphics.tsx` — reusable server-rendered FSA/RSA/GSA line graphics and directional SVGs; hidden from AT because adjacent text supplies their meaning.
7. `apps/web/public/fonts/archivo-variable.ttf` — exact approved, self-hosted Archivo asset copied from historical prototype.
8. `apps/web/public/fonts/Archivo-OFL.txt` — unchanged upstream font licence copied with the font.

New documentation and verification files are entirely within this directory. [artifact-manifest.json](artifact-manifest.json) enumerates every filename and byte size. No other source file changed. About, Membership and Knowledge Centre keep their source, information architecture and substantive copy unchanged; their presentation is implemented through the retained public components and new public-only styles. Existing Source Sans 3, its licence and content exports remain unchanged.

## Implementation and preserved contracts

Home uses the approved aubergine opening, headline, shared frame, cooperative statement, distinct account panels, governance frame, available/unavailable grouping and butter closing panel. Products retains desktop comparison and the mobile-specific account reading order; no narrow scrolling table is introduced. FSA flexibility, RSA cadence and GSA endpoint are conceptual explanations with no measured financial values.

About retains mission, vision, six principles, proposed governance, pending organisational information and FAQ. Membership retains proposed participation/responsibilities, pending fees, three-stage planned journey and closed-registration notice. Knowledge Centre retains the four established categories and explicit unpublished status, without fake resources or search. All three received desktop/mobile visual review.

The shared `site-header.tsx`, `marketing.tsx`, root layout and global stylesheet remain unchanged. Route-gated styles reorder the existing public status strip beneath the masthead and apply approved typography/spacing only when `body:has(> main > .marketing-site)` matches. The existing header continues to own navigation state, Escape, focus restoration, outside dismissal and route-current semantics. No extra header is nested inside main and no duplicate navigation system is introduced.

The masthead motto and status descriptor are presentational generated text; existing truthful announcement content and service restriction remain in the shared markup. Footer legal disclosures remain verbatim. The supplemental “Status & protection” heading is presentational; the underlying legal paragraph is always visible. This preserves the shared component and its protected consumers.

All six anchors `fsa`, `rsa`, `gsa`, `fsa-details`, `rsa-details`, `gsa-details` remain. Overview-return anchors are additional. `how-it-works`, About `governance` and Knowledge Centre `materials` remain available. Existing metadata exports, default noindex/nofollow behaviour, URL validation, share-image/canonical controls, robots and sitemap logic are unchanged and tested. Public navigation now uses actual public routes rather than prototype stand-ins. No forms or links into collection/authentication/financial execution were added.

## Visual acceptance and comparison

[Gallery](index.html) · [Home desktop comparison](comparison-home-1440.png) · [Home mobile comparison](comparison-home-390.png) · [Products desktop comparison](comparison-products-1440.png) · [Products mobile comparison](comparison-products-390.png)

| Dimension | Result |
|---|---|
| Major composition | Home and Products preserve every approved section and graphic; no material structural deviation remains. |
| Typography | Same licensed Archivo/Source Sans 3 files and approved sizes/weights. Corrected inherited heading-width constraints and account-heading weights. Minor rasterisation/wrapping differences remain possible. |
| Spacing | Approved widths, gutters, graphic scale and section rhythm carried into scoped CSS. Home is 22px shorter at both primary widths; Products is 14px taller on desktop and 26px taller on mobile. These are small total-page differences, not pixel-perfect equivalence. |
| Colour | Exact approved primary/surface/accent tokens; corrected an inherited green wordmark dot. No gradient, stock art, generic financial dashboard or invented proof. |
| Masthead/status | Shared navigation retains “About us” and the established “Services are not yet available” announcement text instead of rewriting shared contracts. The approved composition/status treatment is retained. |
| Footer | Approved grouping and readability, with existing route labels and legal wording. The prototype-only bottom note is replaced by the existing public footer signature. |
| Interaction difference | Existing mobile navigation expands in flow and labels itself “Close menu ×” while open; the prototype overlay used “Menu”. In-flow expansion preserves the shared navigation contract and keeps the status/hero unobscured. Escape/focus behaviour and keyboard navigation pass. |
| Remaining public pages | Content-specific existing layouts receive the same identity; their source and claims are preserved. About remains a long mobile page because the original mission/values/governance/FAQ content is retained. |

During review, fixed an About closing-note contrast failure, enlarged-text footer link wrapping, missing underlines caused by Tailwind's reset, legacy wordmark colour and a constrained Products future heading. The source audit also removed three duplicate overview IDs inherited from the prototype, while preserving every existing product destination; DOM ID uniqueness is now checked. No known material visual defect remains. This is a review judgment supported by visual inspection, not a claim that automated tests establish design quality.

## Exact primary screenshots

| Route | Artifact | PNG pixels |
|---|---|---|
| / | [Screenshot](home-1440.png) | 1440 × 3323 |
| /products | [Screenshot](products-1440.png) | 1440 × 3768 |
| /about | [Screenshot](about-1440.png) | 1440 × 4197 |
| /membership | [Screenshot](membership-1440.png) | 1440 × 3064 |
| /knowledge-centre | [Screenshot](knowledge-centre-1440.png) | 1440 × 1986 |
| / | [Screenshot](home-390.png) | 390 × 4263 |
| /products | [Screenshot](products-390.png) | 390 × 4134 |
| /about | [Screenshot](about-390.png) | 390 × 6214 |
| /membership | [Screenshot](membership-390.png) | 390 × 4463 |
| /knowledge-centre | [Screenshot](knowledge-centre-390.png) | 390 × 2883 |

All native capture dimensions were independently checked using the image files. Full-page captures include status, masthead, entire route and legal footer. Scrollbars are hidden for matched screenshot comparison, as in the approved prototype renderer; the existing T39 browser suite also checked ordinary viewport layout independently.

## Responsive matrix

Numbers are full-page PNG heights; screenshot widths equal the first column. PASS means all five routes had no horizontal overflow, text-clipping flags, axe violations or incomplete findings at that width.

| Width | Home | Products | About | Membership | Knowledge | Result |
|---:|---:|---:|---:|---:|---:|---|
| 320 | 4917 | 4656 | 6831 | 4973 | 3197 | PASS |
| 390 | 4263 | 4134 | 6214 | 4463 | 2883 | PASS |
| 768 | 3551 | 4020 | 5062 | 3810 | 2383 | PASS |
| 1024 | 3190 | 3818 | 3959 | 3082 | 1983 | PASS |
| 1440 | 3323 | 3768 | 4197 | 3064 | 1986 | PASS |

Both fonts loaded on every route at every width. At 320px the motif and proposed roles reflow vertically; at 390px the account summaries use compact illustrated entries. At 768px governance and closing layouts avoid cramped side-by-side text. At 1024px the existing menu is used. At 1440px desktop navigation, the account triptych and comparison are fully expressed.

All five routes passed 200% root text enlargement at 390px with no overflow or clipping flags. All five passed a 720 CSS-pixel / 2× scale zoom-layout equivalent. Long words may break at extreme enlargement to keep text available. This checks reflow, not Chrome's browser zoom UI or OS text scaling. [Detailed metrics](public-matrix.json) and [interaction results](interaction-results.json).

## Accessibility and interaction verification

- Final automated axe matrix: **25/25 clean** under WCAG A/AA, 2.1 AA and 2.2 AA tags, with zero violations and zero incomplete findings. Open-menu axe audit also has zero violations/incomplete findings.
- Existing T39 browser script independently passes 25 route/width audits, computed contrast checks, menu navigation, Escape/focus restoration, active route, native FAQ keyboard activation, skip link and reduced motion. [Audit results](existing-browser-audit.json).
- Shared-frame keyboard activation reaches participation; product anchors reach their sections. Focus outlines are 3px with 5px offset and contrast on light/dark surfaces. [Focus capture](keyboard-focus.png), [menu capture](mobile-menu-open.png).
- No collection controls, missing local anchors, failed browser resource requests, runtime exceptions or console errors were recorded. Fonts are self-hosted; no external font request is needed.
- Disclosures stay visible; only existing FAQs use native disclosures. No animation library was added. Reduced motion uses immediate scrolling.
- Eight protected route/width comparisons match the saved baseline exactly, both clean and with marketing CSS deliberately resident. This checks computed visible-element typography, colours, layout and dimensions; it is not an assertion of identical authenticated fixture records. Separate existing T40/T41/T42 suites cover authenticated fixture behaviour.

Automated checks **do not establish full WCAG 2.2 AA conformance**. Manual screen-reader, real-device, browser-zoom UI, forced-colour and hosted performance/CLS testing remain outside this local acceptance. No claim of zero CLS or full assistive-technology certification is made.

## Static, public and protected verification

| Check | Result |
|---|---|
| `pnpm --filter @safethrift/web typecheck` | PASS |
| `pnpm --filter @safethrift/web lint` | PASS |
| `pnpm --filter @safethrift/web build` | PASS; optimized production build, all five public routes static |
| Existing T39 browser script | PASS; 25 cases, all assertions retained |
| Existing HTTP/SEO/closed-gate/unit checks | PASS; 41/41 |
| T40 registration browser | PASS; unchanged guarded fixture |
| T41 dashboard browser | PASS on retry; initial 20-second fixture startup timeout recorded, not counted as a pass |
| T42 loan browser | PASS; unchanged guarded fixture, run after successful T41 |
| Protected computed-style preservation | PASS; 8/8 baseline and resident-style comparisons |
| T38 integration-test integrity | PASS; exact approved SHA-256 retained |
| Git whitespace | PASS |

See [static-results.json](static-results.json), [production-results.json](production-results.json), [protected-regressions.json](protected-regressions.json), [browser-errors.json](browser-errors.json) and [preservation-results.json](preservation-results.json).

The first sandboxed build failed because Turbopack could not bind its local worker port; the approved rerun outside the sandbox passed. An early ad-hoc HTTP run lost its preview process and failed on connection errors; the final self-contained preview harness completed all 41 checks. T41's first fixture startup timed out during concurrent verification load; after load settled, the exact unchanged suite passed without timeout or guard changes. All these attempts are distinguished from final passing evidence.

T40 exercised only its approved local synthetic submissions. T41 exercised approved local simulations; default production gates remain closed. T42 checked protected loan/reviewer views, ownership boundaries and disabled mutations. No live payment, deposit, withdrawal, loan, repayment or membership collection occurred. No additional backend suite was necessary: backend/financial/authentication files are unchanged, the requested protected suites passed and no dependency regression was found.

## Test-service lifecycle and known retained diagnostic data

Created only task-labelled containers `safethrift-t39-phase-b-postgres` (127.0.0.1:55448) and `safethrift-t39-phase-b-redis` (127.0.0.1:55449), using existing images. Applied only the eight existing migrations to new database `safethrift_t39_phase_b_test`. No shared/production database, preexisting container or migration source was altered. Fixture loopback/test-database guards remained active.

Both new containers are stopped and retained for inspection. The failed T41 attempt left **two synthetic members, two synthetic accounts and 25 synthetic savings transactions** in this new isolated database. They were not erased. There are no loans or other active database sessions. Redis has zero keys. [Final service evidence](test-service-cleanup.json). Preview processes are stopped by their harnesses; the isolated baseline preview is stopped after final audit. No hosted service is involved.

## Final preservation and review boundary

The baseline contains **503** existing tracked/prototype files: exactly the five approved implementation/T39-verification files listed above changed; **498** remain byte-identical. No historical prototype, accepted T38/T42 evidence, API code, protected UI, authentication, schema, migration, CI, financial policy or ignore file changed. Both accepted commits remain in history. HEAD and branch are unchanged; index is empty.

The earlier public implementation/design documents and all prototype README approval notes remain historical records and were not rewritten. This report records the newly authorised Phase B state.

No branch creation/switch, staging, commit, push, PR or deployment command occurred. Stop here for review; no further work is authorised after the final report.
