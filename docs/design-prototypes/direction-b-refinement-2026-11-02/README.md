# Safethrift — Direction B final refinement

2 November 2026. **Prototype only. Phase B has not started.**

## Review the designs

| Full-page prototype | Exact PNG dimensions | Live static source |
|---|---|---|
| [Homepage desktop](home-1440.png) | 1440 × 3345 | [Home HTML](home.html) |
| [Homepage mobile](home-390.png) | 390 × 4285 | [Home HTML](home.html) |
| [Products desktop](products-1440.png) | 1440 × 3754 | [Products HTML](products.html) |
| [Products mobile](products-390.png) | 390 × 4108 | [Products HTML](products.html) |

[Visual review gallery](index.html) · [Interaction board](interaction-board.png) · [Design rationale, before/after and critical review](DESIGN-REVIEW.md)

Open full-page PNGs at full resolution; fitting the entire image on screen makes normal reading text appear tiny. Real Archivo and Source Sans 3 are self-hosted from the original sibling prototype's licensed assets. Fonts use no external requests. Keep both prototype folders together when opening the HTML. Local sources use ordinary HTML/CSS and a small menu/anchor script, with no application dependency.

## Before and after

[Home desktop comparison](comparison-home-1440.png) · [Home mobile comparison](comparison-home-390.png) · [Products desktop comparison](comparison-products-1440.png) · [Products mobile comparison](comparison-products-390.png)

The shared-frame motif replaces navigation-like tabs; saving and participation sit within accountability. Each account gets a distinct conceptual line graphic. A typographic cooperative statement, compact mobile account entries, a framed responsibility diagram, grouped availability information and a shorter footer improve the whole homepage. Products has a more legible comparison, an RSA cadence frieze, conditional Savings Points language and one common before-launch checklist.

At 390px Home changes from **4386 to 4285px** (101px / 2.3% shorter); Products from **4438 to 4108px** (330px / 7.4% shorter). Desktop Home changes from 3692 to 3345px; Products grows from 3529 to 3754px to give account diagrams and explanations room. No arbitrary height target, reduced body-text scale or hidden disclosure was used to achieve these results. Mobile main reading text remains 17–18px; supporting/legal copy is 16px. Status, metadata and category labels are 12–14px.

## Responsive verification

Full-page evidence exists for both pages at 320, 390, 768, 1024 and 1440 CSS pixels, device scale 1. Exact PNG dimensions were independently read from the files. In the table, the final column is axe violation / incomplete rule counts.

| Page | Exact PNG pixels | Document scroll width | Text clipping flags | Axe V / I |
|---|---|---|---|---|
| Home | 1440 × 3345 | 1440 | 0 | 0 / 0 |
| Home | 1024 × 3210 | 1024 | 0 | 0 / 0 |
| Home | 768 × 3571 | 768 | 0 | 0 / 0 |
| Home | 390 × 4285 | 390 | 0 | 0 / 0 |
| Home | 320 × 4966 | 320 | 0 | 0 / 0 |
| Products | 1440 × 3754 | 1440 | 0 | 0 / 0 |
| Products | 1024 × 3803 | 1024 | 0 | 0 / 0 |
| Products | 768 × 4004 | 768 | 0 | 0 / 0 |
| Products | 390 × 4108 | 390 | 0 | 0 / 0 |
| Products | 320 × 4658 | 320 | 0 | 0 / 0 |

- **320px:** principles become a vertical relationship inside the frame, governance roles become a single readable sequence, and account names wrap while codes remain intact. Footers are intentionally tall. No horizontal overflow or clipping was detected; narrow headings and footer link wrapping were visually inspected.
- **390px:** paired principles and compact account entries; account details read in one column, without a duplicate comparison. Legal text stays visible. Mobile navigation has both closed and open examples.
- **768px:** two-column hero and legible comparison remain. Governance and closing compositions switch to a wider stacked format to avoid cramped columns. Reading text stays 18px.
- **1024px:** two-column content with a menu disclosure rather than crowded desktop navigation. Account panels and comparison remain legible.
- **1440px:** full desktop navigation, shared-frame hero and three-account overview. Products uses a distinct introduction and account narrative arrangement.

Both pages were additionally checked at **200% root text size at 390px**: viewport and document width remain 390px and text-clipping flags are empty. Long words can break to keep text available; the wordmark and menu reflow onto separate rows. The enlarged-text PNGs are 390 × 1400px crops, not full-page artboards. Resulting full document heights are recorded in interaction-checks.json. A **720 CSS-pixel / 2× device-scale reflow check**, equivalent to the available layout width of a 1440px viewport at 200% zoom, also has no horizontal overflow. This is a layout simulation, not a claim of exercising Chrome's browser-zoom UI. Real browser zoom, OS text scaling, screen readers and physical devices remain unverified.

## Interaction evidence

- [Mobile menu closed](state-menu-closed.png), [mobile menu open](state-menu-open.png): 390 × 844px each.
- [Keyboard navigation focus](state-navigation-focus.png), [motif focus](state-motif-focus.png), [motif hover](state-motif-hover.png): 1440 × 900px each.
- [Navigation active and hover](state-navigation-active-hover.png): 1440 × 650px.
- [Account link context](state-product-links.png): 1440 × 900px.
- [Home 200% text](home-text-200.png), [Products 200% text](products-text-200.png): 390 × 1400px each.

Escape closes the open menu and restores focus to its button. Keyboard Enter on the motif reaches and focuses participation. All six existing product IDs resolve, and local informational anchors have no missing destinations. A desktop target-size scan found no visible link or button smaller than 24 × 24 CSS pixels; menu links and main controls use at least 44px height. This scan is not a full target-spacing audit on every device. Reduced motion changes smooth anchor scrolling to immediate scrolling; there are no animated diagrams or animation libraries. [Detailed interaction rules](DESIGN-REVIEW.md#interaction-specification).

## Accessibility evidence and limits

The ten default page/width audits have **zero axe violations and zero incomplete findings**, with WCAG A/AA, 2.1 AA and 2.2 AA tags. Both font faces report loaded at every width. The open-menu audit has **zero violations and one incomplete colour-contrast rule**; the overlaid menu obscures underlying hero content and that state is not represented as an unqualified clean audit. The menu text colour pairs are independently calculable: aubergine on chalk **12.84:1**, and aubergine on lilac **10.44:1**. Palette ratios are retained in palette-contrast.json; this does not automatically resolve every composited-state concern. The screenshot was manually inspected for readable menu labels and focus restoration was tested.

Text clipping checks compare client/scroll dimensions for headings, paragraphs, anchors and buttons. They complement visual review; they are not a universal glyph-overlap or assistive-technology test. All text remains in the document without line clamping or hidden legal accordions. Automated checks and palette ratios **do not establish full WCAG 2.2 AA conformance**.

## Content and implementation boundaries

Proposed accounts are unavailable; no applications, account opening, deposits, withdrawals, lending or repayments are enabled. No rates, returns, fees, account balances, eligibility calculations, voting weights or guaranteed access are invented. Points are conditional. Incorporation/authorisation/protection remain unconfirmed. Informational About, Membership and Knowledge Centre links land on labelled Home sections; these two artboards do not implement those full routes.

Only this new directory was written. The original Direction B folder is unchanged. Preservation checks hash **461 preexisting tracked/historical files**, with **zero changes**, including existing application code, historical prototype assets and tracked ignore files. Git HEAD remains `980b1db12a311bd7cf909b4cff64d04317b5d73f`; tracked diff and staged diff are empty. The session began with only `?? docs/design-prototypes/` in porcelain status; no unrelated ignore modifications were visible, and none were edited. T38/T42 evidence and implementation were preserved byte-for-byte; their technical tests were not rerun, since no application code changed. No staging, commits, pushes or deployment occurred.

## Package and reproduction

- `home.html`, `products.html`, `prototype.css`, `prototype.js`: isolated review sources.
- `render.mjs`: fresh headless Chrome + temporary loopback file server; uses installed axe and the existing browser launcher read-only. No package install. Run from repository root: `node docs/design-prototypes/direction-b-refinement-2026-11-02/render.mjs`. A sandbox may require permission to bind the temporary port.
- `visual-checks.json`, `interaction-checks.json`, `palette-contrast.json`, `preservation-checks.json`: bounded evidence.
- `review-pass/`: intermediate visual evidence of the critique and revision, not final deliverables.
- `DESIGN-REVIEW.md`: rationale, interaction specification, source review, comparison and candid remaining weaknesses.

**Stop here. Explicit approval is required before Phase B production implementation.**
