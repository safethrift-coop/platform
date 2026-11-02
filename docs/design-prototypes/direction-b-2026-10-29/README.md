# Safethrift Direction B — visual prototypes only

29 October 2026. Awaiting visual approval. This folder is an isolated static
artboard package, not a Next.js implementation. Do not deploy it. No application,
API, authentication, protected interface, schema, migration, CI or financial
execution file was edited or activated.

## Four final full-page artboards

| Page | Exact PNG pixels | Image |
|---|---|---|
| Homepage desktop | 1440 × 3692 | [Home desktop](home-1440.png) |
| Homepage mobile | 390 × 4386 | [Home mobile](home-390.png) |
| Products desktop | 1440 × 3529 | [Products desktop](products-1440.png) |
| Products mobile | 390 × 4438 | [Products mobile](products-390.png) |

Inspect the PNGs at full resolution. Fitting a long full-page screenshot into a
small preview makes actual 18–19px body type look much smaller. All pages include
their mastheads, complete content, final information action and legal footer.

The two HTML files and prototype.css are static prototype sources only. They
share design tokens, not production components. Links demonstrate local artboard
navigation and hierarchy; section stand-ins do not implement About, Membership or
Knowledge Centre routes. No forms, API calls, account controls or financial flows
exist. Menu interaction is a native disclosure, not a production navigation system.

## Design rationale

- Archivo headings/wordmark; Source Sans 3 reading text. Fonts are local, with their
  OFL licences retained under fonts/. Archivo comes from Google Fonts' ofl/archivo
  source, and Source Sans was copied from the existing licensed website asset.
- Aubergine #382839, chalk #FAF7F2, butter #F0D477, mist lilac #E2DFEB.
- Home gives Saving / Participation / Accountability a connected, offset treatment.
  Each links to its relevant explanation; these are not statistic or feature cards.
- White account rows, lilac governance content and a status ledger give different
  subjects different visual emphasis. A butter closing section leads to membership
  information, with registration remaining closed.
- Products starts with a light information-led opening and desktop comparison.
  Paired FSA/RSA explanations and a separate GSA band replace repetitive vertical
  specification blocks. Shared before-launch requirements are consolidated.
- Mobile is recomposed: a small masthead, vertical offset motif, compact account
  rows, one-column footer and direct account explanations instead of a wide table
  or duplicate comparison. No horizontal scrolling is required.
- No gradients, stock imagery, fabricated people, metrics, testimonials, pricing,
  interest rates, guarantees, regulatory seals or financial-execution CTAs.

## Comparison with the existing website

Reviewed all four corresponding images in ../../screenshots/public-editorial/.
The former presentation uses evergreen/paper, serif headings, repeated small
uppercase labels, similarly paced sections and a dense four-stage hero sidebar.
The prototypes use a stronger sans-serif hierarchy, a participation-specific motif,
a new masthead and different compositions for Home and Products. The account
terminology remains FSA, RSA and GSA. RSA's description is conditional rather than
promising faster access to finance. Material development/availability, membership,
authorisation and deposit-protection disclosures remain represented.

Some familiar patterns are deliberately retained for comprehension: account rows,
comparison tables and legal footers. Originality comes from composition and the
cooperative identity, not making conventional information difficult to use.

## Critical review and revisions

The first pass still had a standard logo-left/link-row header. The revised desktop
masthead uses a larger wordmark, participation note and two-row navigation. The
first mobile Products page repeated its overview immediately before full account
explanations. The duplicate summary was removed; final height is 4438px versus
4887px in the first pass. Footer links were also made a readable single list on
mobile. First-pass PNGs and measurements remain in first-pass/ as revision evidence,
not alternative final deliverables. A decorative arrow was converted to SVG after
an inconclusive text-glyph contrast check; final automated findings are clean.

| Review criterion | Evaluation |
|---|---|
| Visual originality | Distinct motif and masthead; some middle-page text splits remain conventional. |
| Brand recognition | Palette, type and participation language carry across both pages. |
| Trustworthiness | Visible proposed-service status and full disclosures; no invented proof. |
| Typography | Real Archivo loaded; clear hierarchy; additional width/zoom tuning remains. |
| Layout | Different page compositions and subject treatments; lower content can be tighter. |
| Content clarity | Shared requirements consolidated; future services and unpublished resources explicit. |
| Mobile usability | Recomposition rather than scaled table/card grid; pages remain long. |
| Accessibility | Four clean automated captures; manual assistive-technology and full-state review pending. |
| Cross-page consistency | Shared masthead/footer and palette without duplicating the hero. |

## Remaining weaknesses and recommended refinements

1. Home's purpose and governance text splits remain familiar editorial layouts.
   Tighten one into a more concise explanation in a further visual pass rather
   than adding decorative complexity.
2. Full status/legal information produces long mobile pages. Consider consolidation
   with explicit content review, preserving material disclosures and restrictions.
3. Default screenshots are not a complete interaction-state specification. Review
   open menu, keyboard focus and anchor states before implementation.
4. Only 1440px and 390px are final requested artboards. Review 320/768/1024px,
   enlarged text and browser zoom before approving responsive implementation.
5. Draft product wording, especially conditional Savings Points language, needs
   final content approval. These prototypes are not approved financial terms.
6. Authentic photography could add lived context later, but should be commissioned,
   consented and accurately described. It is not needed to fill the layout now.

## Bounded visual verification

visual-checks.json contains the four render records: exact viewport dimensions,
loaded Archivo, no forms, no overflowing elements/horizontal overflow, zero axe
violations and zero incomplete findings for WCAG A/AA/2.1/2.2 AA tags. PNG dimensions
were also inspected. This is not WCAG certification or production regression QA.

render.mjs starts only a temporary loopback file server and fresh headless Chrome
profile, captures these artboards and closes the server/browser/profile. It uses
the existing browser-launch helper and axe development dependency, without starting
Next.js or connecting to a backend. No new runtime package was installed. The
browser plugin's required JavaScript control tool was not exposed in this session;
the isolated screenshot renderer was used as the fallback.

No existing application file was changed. No staging, commit, push or deployment
command was run by this work. HEAD independently moved to 980b1db during the session
and the prior ignore modifications disappeared; those changes were not made here.
The accepted T38 target SHA-256 remains
9bfdf891ef525abdef046c48c22f659d17f356a4c08f3055069cf0ea8586696a.

Stop for visual approval. Do not proceed to Phase B implementation without further
explicit authorisation.
