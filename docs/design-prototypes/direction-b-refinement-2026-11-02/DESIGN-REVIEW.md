# Direction B refinement — design review

2 November 2026. Isolated visual prototypes. **Not approved for production. Phase B has not started.**

## Materials reviewed

Read the original Direction B README, HTML and renderer; visually inspected all four original artboards and all four matching public-editorial Home/Products screenshots. Read the existing public-site redesign handoff, approved earlier design master, T39 baseline, current public product page and central content definitions, shared footer disclosures, and the T42 readiness context. The supplied refinement brief controls this package; the earlier evergreen/serif master is historical context, not the palette for these prototypes. No claim of reconciling the entire original T01–T52 source is made.

Used the installed `.agents/skills/ui-ux-pro-max/SKILL.md`, its web accessibility/responsive checklist and focused UX searches for keyboard focus and text resize/reflow. The useful result was content-driven height, unitless line height and keeping content available under narrow widths and text enlargement. Native-app navigation and styling recommendations were not applied to this public website.

## Art direction: the shared frame

Retain aubergine #382839, chalk #FAF7F2, butter #F0D477 and mist lilac #E2DFEB, Archivo and Source Sans 3. The restrained extra stone surface is a neutral grouping colour, not a new brand accent. Use 4/8px spacing increments, 16–18px reading text, short labels and responsive display type. Fine borders indicate structure, not regulation or product security.

The principle motif uses two adjoining pieces with complementary corners inside an accountability frame. Saving is a personal commitment; participation is a shared responsibility; accountability gives both a common boundary. This is a relationship between principles. It represents no transfers, balances, voting allocation, member count or financial mechanism. All labels and relationships are visible before interaction. Each principle is a normal anchor to its explanation. The motif can be reused as a restrained frame around proposed governance roles, without repeating a decorative illustration at every section.

Product graphics share one line vocabulary but communicate different approaches:

- **FSA — Flexible Savings Account:** a line that accommodates a change of shape; adaptability, not guaranteed withdrawal access.
- **RSA — Regular Savings Account:** repeated vertical strokes; cadence, not deposits made, elapsed periods or points earned. No quantities are attached to the strokes.
- **GSA — Goal-Based Savings Account:** a line meeting a bracket; a defined purpose, not a progress bar, performance projection or achieved objective.

The SVGs are hidden from assistive technology because adjacent text gives their complete meaning. Meaning never depends on colour or the diagrams alone. These are proposal explanations, not product promises.

## Before and after

| Area | Original Direction B | Refinement and reason |
|---|---|---|
| Opening | Huge three-line heading, right-hand paragraph, three tab-like blocks | Headline and framed principles share the opening. Complementary corners and the common boundary give the motif a recognisable silhouette and meaning. |
| Cooperative explanation | Heading on left, several paragraphs on right | One typographic statement followed by a concise explanation and document qualification. This removes a repeated marketing-section rhythm and retains ownership/participation context. |
| Home accounts | Three similar divider rows | A compact triptych with distinct line graphics, names and approaches. Mobile uses compact illustrated entries rather than an identical table or long detail presentation. |
| Governance | Text split and three linear role rows | A common frame contains members, board and management. This explains shared responsibility while visibly qualifying proposed roles. It does not encode voting power or legal authority. |
| Availability | Three status-ledger rows | Available information and unavailable activities have different visual groups; the latter explicitly includes repayments. Planned education remains labelled unpublished. |
| Closing | Another full-width butter band | An inset closing statement and a specific link to the before-launch checklist. Membership information is fully visible rather than deferred to an unavailable application journey. |
| Products | Similar FSA/RSA stories plus a GSA band | FSA adaptability, an RSA cadence frieze and a GSA endpoint use the same graphic family. RSA's horizontal composition interrupts repetition without making account details hard to find. |
| Comparison | Dense headings and repeated unavailable cells | Larger code/name hierarchy, two meaningful comparison rows and one shared availability statement. The mobile page reads the same purposes in the account explanations instead of repeating a comparison and then details. |
| Savings Points | Several separate explanatory paragraphs | One conditional explanation and a prominent no-entitlement statement. No conversion, rate, cap or guaranteed finance is invented. |
| Shared requirements | Separate explanation and broad section spacing | One common before-launch checklist; account-specific caveats remain beside each account. |
| Future concepts | Two-column bullet inventory | A quieter labelled aside, explicitly separate from core account proposals. No launch dates or operational claims. |
| Footer | Long single navigation list and several dense blocks | Two short navigation columns, then two titled legal blocks, then the prototype note. All material development, availability, incorporation, authorisation and protection disclosures remain visible. |

Compared with the older public-editorial website, this retains its truthful development-aware content but replaces evergreen, serif typography, repeated editorial splits and the four-stage hero sidebar. It does not carry forward unqualified promises in the central content source about faster access to support.

## Interaction specification

| State | Designed behaviour | Visual evidence |
|---|---|---|
| Desktop default | Underline identifies current page, with `aria-current=page`. | Full-page desktop artboards |
| Desktop hover | Underline on navigation; thicker underline on product links; background change on primary information links. | `state-navigation-active-hover.png` and inspect live HTML |
| Keyboard | 3px outline with 5px offset; butter on dark, aubergine on light. Skip link appears on focus. No sticky bar covers focus. | `state-navigation-focus.png`, `state-motif-focus.png` |
| Mobile closed/open | Labelled button exposes `aria-expanded` and `aria-controls`. Open menu sits in document reading order beneath the masthead. Current page has a lilac background. | `state-menu-closed.png`, `state-menu-open.png` |
| Menu keyboard behaviour | Standard Tab navigation; Escape closes and returns focus to the toggle. Moving focus outside closes the menu. It is a navigation disclosure, not a modal requiring a focus trap. | `interaction-checks.json` |
| Cooperative motif | Links remain labelled and readable. Hover or focus highlights the frame; the selected principle is underlined or outlined. No diagram content is revealed only on hover. | `state-motif-hover.png`, `state-motif-focus.png` |
| Product anchors | FSA/RSA/GSA links move to the relevant account and focus its section. The six existing `fsa`, `rsa`, `gsa`, `fsa-details`, `rsa-details`, `gsa-details` IDs remain. Additional overview return anchors are included. | `interaction-checks.json`, `state-product-links.png` |
| Informational navigation | Home and Products are the two local artboards. About, Membership and Knowledge Centre link to labelled Home explanations. They do not pretend that additional full routes or articles are built. | Live HTML sources |
| Disclosures | Always visible text. No accordion or hidden financial restriction. No collection forms or financial controls. | All full-page artboards |
| Reduced motion | Normal anchors with immediate scrolling. No animation library, entrance sequence, autoplay or animated diagram. | Recorded `scrollBehavior=auto` with reduced motion |

Local HTML can be opened directly; sibling historical fonts must remain at their current relative location. The renderer serves only the prototype tree on a temporary loopback port and closes its fresh browser profile/server afterward. It does not run Next.js, call a backend or connect to existing user browser sessions.

## Critical self-review and revisions

The first refinement still repeated purpose copy and grew the Home mobile page to 4604px. It also had an FSA caveat contrast failure and enlarged-text overflow. The retained `review-pass/` evidence records that intermediate state. Consolidated the cooperative explanation; reduced repeated participation copy; corrected contrast; added safe wrapping and content-driven heights. A stepped GSA symbol was replaced because it could imply financial growth. Manual screenshot inspection caught wrapped RSA/GSA abbreviations that page-level overflow tests missed; protected the abbreviations and corrected their mobile proportions. Tablet governance and closing sections were recomposed to avoid cramped columns. Product RSA received a different composition to avoid three identical panels. SVG UI glyphs replaced font-dependent arrows.

Remaining weaknesses are real:

1. The shared frame is more coherent than the original tabs, but complementary corners and coloured panels are familiar modern design devices. Brand-recognition/user-comprehension testing is still needed before treating this as a final identity asset.
2. The Products page deliberately retains comparison-table conventions. Its FSA and GSA details share a structure; account accuracy and scanability take precedence over forcing every product into a different pattern.
3. The Points and before-launch sections retain editorial columns on desktop. These are the most conventional areas and could still resemble a well-made template in isolation. They have different jobs—explanation and checklist—and adding ornament would reduce clarity.
4. Mobile remains long, especially at 320px and with 200% text. Material legal information stays expanded, and the new identity graphics occupy space. This is not a claim that every page is shorter or that pixel height alone measures quality.
5. The two-column mobile footer is much clearer, but still demands reading. Its legal copy should receive content/legal approval; these prototypes neither establish regulatory status nor provide a legal opinion.
6. No fabricated social proof, member voices, photography or outcome metrics were added. The result is necessarily abstract until authentic, approved organisational material exists.
7. Real-device, screen-reader and browser zoom UI testing remain outstanding. Automated checks are bounded evidence, not proof of WCAG 2.2 AA conformance.

Do not deploy this package. Stop for explicit visual approval before Phase B.
