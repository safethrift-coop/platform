# T39 final visual polish — About & Knowledge Centre

2 November 2026. **READY FOR FINAL REVIEW.** This is a narrow presentation refinement, not production readiness or deployment approval.

## Review the visual evidence

[Gallery](index.html) · [About desktop comparison](comparison-about-1440.png) · [About mobile comparison](comparison-about-390.png) · [Knowledge desktop comparison](comparison-knowledge-centre-1440.png) · [Knowledge mobile comparison](comparison-knowledge-centre-390.png)

| Page | New full-page desktop | New full-page mobile |
|---|---|---|
| about | [Desktop](after/about-1440.png) · 1440 × 3817 | [Mobile](after/about-390.png) · 390 × 5741 |
| knowledge-centre | [Desktop](after/knowledge-centre-1440.png) · 1440 × 1980 | [Mobile](after/knowledge-centre-390.png) · 390 × 2836 |

The four comparison sheets use the original Phase B PNGs on the left and new captures on the right. They do not overwrite historical evidence. Fresh pre-edit captures are also retained under `before/`; after captures are under `after/`. All screenshots include the unchanged masthead, development strip and footer. Each file's dimensions were independently read from the PNG.

## Git baseline and scope

Starting branch: `main`. Starting and final HEAD: `980b1db12a311bd7cf909b4cff64d04317b5d73f`. The index was and remains empty. Phase B was already uncommitted; its changes were treated as user work, not attributed to this task.

Starting short status:

```text
 M apps/web/src/app/page.tsx
 M apps/web/src/app/products/page.tsx
 M apps/web/src/components/public-site/editorial.tsx
 M apps/web/src/components/public-site/marketing.css
 M apps/web/tests/browser-check.mjs
?? apps/web/public/fonts/Archivo-OFL.txt
?? apps/web/public/fonts/archivo-variable.ttf
?? apps/web/src/components/public-site/graphics.tsx
?? docs/design-prototypes/
?? docs/t39-phase-b-2026-11-02/
```

[baseline.json](baseline.json) retains the complete starting status and hashes for **566** preexisting tracked and untracked files. The existing prototype and Phase B evidence trees are unchanged.

Exactly three application files changed during this task:

1. `apps/web/src/app/about/page.tsx`: one page-specific wrapper and section class names. Existing components, section order, content, metadata and links are retained.
2. `apps/web/src/app/knowledge-centre/page.tsx`: one page-specific wrapper and a learning-section class name. Existing resource categories, disclaimer text and About link are retained.
3. `apps/web/src/components/public-site/marketing.css`: an appended block only. Every added selector requires `.m-about-page` or `.m-knowledge-page`. All preexisting Phase B CSS bytes remain intact.

No shared component was edited. The wrappers allow isolation without changing `MarketingSite`'s public API. No Home, Products, Membership, font, palette, navigation, footer, public content definition, metadata helper, browser assertion or protected implementation changed. No runtime dependency or client-side behaviour was added.

Source diffs relative to the **starting uncommitted Phase B state**, rather than HEAD, are retained in [About diff](about-source.diff), [Knowledge diff](knowledge-centre-source.diff) and [CSS diff](marketing.css.diff). [CSS scope audit](css-scope-audit.json) lists all 69 new scoped selectors.

All new documentation, scripts, screenshots and measurement evidence are inside this directory. [artifact-manifest.json](artifact-manifest.json) lists every relative filename and byte size.

## Issues identified and refinements

| Area | Before | Refinement |
|---|---|---|
| About purpose/mission | Statement and body used a different grid from the section heading; mission/vision labels were crowded against preceding paragraphs. | Align the existing reading columns; add deliberate separation before mission and vision; improve paragraph leading. Supporting display statements are subordinate to the section heading. |
| About principles | Small numbers, inconsistent baseline alignment, row gaps and inherited paragraph margins accumulated on mobile. | Align 16px tabular Archivo numbers with headings; control the number column; remove accidental paragraph/row spacing; retain numbered editorial entries and body text. |
| Proposed governance | A frame plus repeated internal rules competed on desktop; mobile roles accumulated padding and gaps. | Keep the frame and all three proposed roles; simplify desktop separators and use one clear separator between mobile roles. Proposed-status labels and qualifications remain visible. |
| Organisational information | Labels, headings and paragraphs had uneven spacing. | Use consistent label/heading relationships, bounded text measures and a coherent column gap. No team/appointment/vacancy claims changed. |
| Transparency/closing | FAQ columns did not align with preceding editorial columns; closing copy crowded its heading. | Align the FAQ grid and improve closing heading-to-copy spacing, preserving native disclosures and all links. |
| Knowledge introduction | Desktop title wrapped awkwardly across three lines beside a relatively loose introduction. | Give the existing title enough column width to wrap naturally into two lines at 1440px. Font face, size and words remain unchanged. |
| Collection | Status labels floated beside headings on desktop and were small/detached on mobile. | Put the existing status immediately below each category's description; align numbers and headings; increase status text to 16px; keep the editorial list rather than cards. |
| Lilac learning section | Heading and reading columns had different alignments. | Align heading/reading columns and use a subordinate display statement with comfortable body leading. Keep the lilac surface, financial-information disclaimer and existing About link. |

Body copy remains **18px** at default text settings. Publication notes and status text are raised from 15px to **16px** where applicable. The secondary display statements use 24–32px to establish their relationship to larger section headings; body text was not reduced to shorten pages. No colour token, display family, reading family or brand motif changed.

## Content preservation

All five public routes' complete main-content text, normalised only for whitespace, matches the fresh pre-edit render at every tested width: **25/25 equal**. This includes the original mission, vision, six principles, proposed roles, organisational-status text, FAQs and all resource/financial disclaimers. No punctuation, factual wording or substantive claim was rewritten. No publication dates, articles, authors, downloads, search or new service control was introduced.

[content-preservation.json](content-preservation.json) retains matching text hashes. Source metadata declarations, hrefs, anchor IDs and shared components are unchanged. Existing public tests independently verify available routes, resource category names, product destinations, metadata and restrictions.

## Responsive measurements

Full-page heights before → after are shown below; each PNG width equals the first column. There is no height target. Knowledge at 768/1024px can become slightly taller because development status now occupies a clear line beneath each description and supporting text is larger.

| Width | About height | Knowledge height | Layout / axe |
|---:|---:|---:|---|
| 320 | 6831 → 6359 | 3197 → 3117 | PASS |
| 390 | 6214 → 5741 | 2883 → 2836 | PASS |
| 768 | 5062 → 4718 | 2383 → 2497 | PASS |
| 1024 | 3959 → 3652 | 1983 → 1995 | PASS |
| 1440 | 4197 → 3817 | 1986 → 1980 | PASS |

Both fonts loaded at all widths. No horizontal overflow, clipped text, duplicate IDs, overlapping layout detected in visual review, or sub-24px visible control target was recorded on the affected pages. Headings wrap naturally. Native menu and FAQ controls retain existing touch targets. The 320, 768 and 1024px captures for both pages are included in the gallery and `after/`.

Both pages passed 200% root text enlargement at 390px, without overflow or clipping flags. A 720 CSS-pixel reflow check also passes; it represents the available width of a 1440px viewport at 200% zoom, not operation of the browser's zoom UI. Enlarged-text images are 390 × 1500px crops, not full-page screenshots. Full document measurements are in [after-browser.json](after-browser.json).

## Accessibility, public functionality and static results

| Verification | Result |
|---|---|
| `pnpm --filter @safethrift/web typecheck` | PASS |
| `pnpm --filter @safethrift/web lint` | PASS |
| `pnpm --filter @safethrift/web build` | PASS; local optimized production build |
| Existing `pnpm --filter @safethrift/web test:browser` | PASS; 25 route/width cases, unchanged assertions |
| Existing HTTP/SEO/metadata/closed-gate and related unit checks | PASS; 41/41 |
| Additional About/Knowledge axe checks | PASS; 10/10, zero violations and zero incomplete findings |
| Keyboard/native FAQ | PASS; Enter opens disclosure, focus is visible |
| Mobile menu | PASS; Escape closes and restores focus to toggle |
| Reduced motion | PASS; computed HTML scroll behaviour is `auto` |
| Enlarged text / reflow | PASS on both affected pages |
| Browser console/runtime/resource errors | None recorded |

The existing browser suite includes computed text-contrast checks, active navigation, mobile route changes, keyboard FAQ activation, skip-link focus and reduced motion. Assertions and timeouts were not edited or weakened. See [static-results.json](static-results.json), [verification-run.json](verification-run.json), [existing-browser/results.json](existing-browser/results.json), and [after-browser.json](after-browser.json).

Automated checks **do not establish full WCAG conformance**. Manual screen-reader use, physical-device/browser coverage, OS text scaling, actual browser-zoom UI and hosted performance remain untested. The supporting statements and desktop Knowledge title reflow are intentional typography/layout refinements for review. About remains long on mobile because all substantive material is preserved.

## Other public pages and protected-route impact

Home, Products and Membership are **pixel-identical before and after at all five widths**: 15/15 fresh screenshot comparisons, with identical dimensions and visible-element computed styles. This is exact pixel equality in the bounded local Chrome captures, not a guarantee across every browser. [public-visual-preservation.json](public-visual-preservation.json) contains the results; the before/after PNGs remain available.

Protected output was compared on `/register`, `/login`, `/verify-email`, `/dashboard`, account details, loan list, loan application, loan details, loan application status and loan review, at 390px and 1440px: **20/20 views unchanged**. Each comparison checks the complete main text and visible-element computed typography, colours, spacing and layout. The updated marketing stylesheet was then deliberately injected as resident CSS; output remained unchanged in all 20 cases, and neither new page marker was present.

No protected route, authentication, financial code, shared component or dependency changed. Every new CSS selector requires a marker used only on the two authorised public pages. This provides the isolation/output evidence requested to omit additional T40/T41/T42 authenticated browser-fixture runs. **Those three browser suites were not run in this task, and no new pass is claimed.** Their historical Phase B evidence remains unchanged. Existing default closed-registration/dashboard tests did run and passed. No database, Redis or financial fixture service was started or reset.

[protected-impact.json](protected-impact.json) records each protected comparison. The output checks concern default closed/sign-in states; they are not an assertion that authenticated dynamic fixture data was re-exercised.

## Preservation and final state

- Baseline files: 566; authorised task edits: 3; all other **563 files byte-identical**.
- Original prototypes, Phase B screenshots/report/evidence, T38/T42 evidence, all existing browser-test assertions, fonts, ignore files and unrelated uncommitted work remain intact.
- Approved T38 integration test SHA-256 remains `9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a`.
- Branch and HEAD are unchanged. Index remains empty. Git whitespace inspection passes.
- No branch creation/switch, reset, stash, staging, commit, push, PR or deployment occurred.
- The temporary loopback production previews were stopped by their harnesses after each run. No application/test service is intentionally left running.

Final short status includes both the **preexisting Phase B work** and this task's authorised additions:

```text
 M apps/web/src/app/about/page.tsx
 M apps/web/src/app/knowledge-centre/page.tsx
 M apps/web/src/app/page.tsx
 M apps/web/src/app/products/page.tsx
 M apps/web/src/components/public-site/editorial.tsx
 M apps/web/src/components/public-site/marketing.css
 M apps/web/tests/browser-check.mjs
?? apps/web/public/fonts/Archivo-OFL.txt
?? apps/web/public/fonts/archivo-variable.ttf
?? apps/web/src/components/public-site/graphics.tsx
?? docs/design-prototypes/
?? docs/t39-final-polish-2026-11-02/
?? docs/t39-phase-b-2026-11-02/
```

See [preservation-results.json](preservation-results.json) for the task-relative file inventory and unchanged historical-evidence checks. New files in this directory are verification/documentation only.

**READY FOR FINAL REVIEW. Stop here for user review; no production-readiness or full-WCAG claim is made.**
