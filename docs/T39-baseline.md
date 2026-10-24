# T39 baseline — 23 October 2026

Inspected before implementation. Main and origin/main both at `8cfd0e3`; clean working tree. `git pull --ff-only origin main` confirmed up to date. Created `feat/t39-public-marketing-website`. No earlier T39 commits found in local history.

Existing pnpm 10.33.0 monorepo: NestJS API, Prisma workspace, Next.js 16.2.4 / React 19.2.4 / Tailwind 4 web app (the supplied brief's Next.js 15 context is outdated). Strict TypeScript, flat ESLint config, App Router. One homepage with name and tagline, root title/description, no website components or tests. Only starter SVG assets/favicon; no approved brand system, photography, team information, legal documents, or domain approval. All web source/configuration and installed Next.js documentation reviewed. Backend entry point and module boundaries inspected; marketing pages need no API integration.

Baseline `pnpm --filter @safethrift/web exec tsc --noEmit`: PASS. `pnpm --filter @safethrift/web lint`: PASS. Sandboxed production build: BLOCKED by Turbopack local worker port permissions; rerun outside sandbox pending at baseline recording.

CI installs frozen dependencies, generates Prisma, checks API/web types and lint, applies migrations, runs API unit tests and a nonblocking security audit. It lacks a web production build or website test step. Root `pnpm test` is a deliberate failing placeholder; web has no test command.

Source materials: supplied T39 implementation prompt, architectural design, business copy in Pasted text (2).txt, roadmap in Pasted text(3).txt. Business descriptions establish product names/purposes, four resource categories and proposed governance, but do not establish legal approval or operational availability. £30/£50 fees are proposals, not verified approved terms. Backend domain strings are not domain ownership approval.

Implementation decisions: restrained green/cream visual foundation, text wordmark, local system fonts, static Server Components, native disclosure FAQ, small accessible client navigation. No new runtime dependency or backend change. URL configuration and indexing must default safely until publication approval. Keep all work uncommitted and prepare a local PR description, following the user's explicit clarification.
