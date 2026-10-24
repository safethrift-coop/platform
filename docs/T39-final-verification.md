# T39 final verification for draft PR preparation

Date: 24 October 2026. Node 22.21.1; pnpm 10.33.0.

Branch: `feat/t39-public-marketing-website`. Initial HEAD and freshly fetched `origin/main`: `8cfd0e3dcabe8ac15109e36b1a488e062fce3b8c`; divergence 0/0. Existing history is preserved. No existing PR was found. Origin is `https://github.com/safethrift-coop/platform.git`.

This verification supersedes the local-only status in the historical refinement report and Git status snapshot. The user authorised a T39 commit, feature-branch push and draft PR. Merge, deployment, publication and indexing remain unauthorised.

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

All five pages render; FSA/RSA/GSA cards, four-step journey, responsive layouts and navigation are present. Production tests verify no localhost social URLs, noindex/nofollow, robots disallow, empty domainless sitemap, linked assets and branded 404. No backend service was needed for T39. `.nvmrc` selects Node 22 and Actions reads the same file. No dependency versions were upgraded during preparation; the existing T39 lockfile diff adds dev-only axe and pnpm normalisation.

Ports 2025, 2026 and 2039 were confirmed free before servers started. No existing process was terminated. Browser Chrome uses a temporary profile removed by its script. Final browser JSON and ten screenshots were refreshed from this run; the original homepage comparison pair and original contrast baseline are retained.

## Lighthouse

- Mobile: performance 85, accessibility 100, best-practices 100, seo 63. No runtime error.
- Desktop: performance 99, accessibility 100, best-practices 100, seo 63. No runtime error.

Lighthouse used `pnpm dlx lighthouse http://127.0.0.1:2039 --chrome-flags='--headless --no-sandbox --disable-dev-shm-usage' --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=/tmp/t39-pr-lighthouse-mobile.json --quiet`; desktop adds `--preset=desktop` and its own output path. See [current summary](T39-lighthouse-results.json). SEO is penalised for intentional noindex. Performance scores are single local lab observations; framework JavaScript opportunities remain. Historical scores in the refinement report are from 23 October, not this rerun.

## Scope and privacy audit

Reviewed tracked modifications and all untracked candidate paths, source, styles, configuration, tests, documentation and screenshots. Changes are confined to web, T39 evidence, `.nvmrc`, CI and the existing lockfile. No unrelated changes were found. No secrets, environment files, dependencies, build outputs, logs or temporary profiles are included. The CI database URL is its pre-existing disposable test-service configuration. API and Prisma changes are absent.

No authentication, registration processing, KYC, payments, financial transactions, backend business logic, financial guarantees, approved fee claims or approved regulatory status were introduced. Proposed services remain unavailable. T40 registration, T41 dashboard, T42 loan UI and T43 admin UI remain excluded.

## Independent review and publication approvals

Hosted Actions results must be inspected on the draft PR; local results above do not claim hosted success. At the pre-push check, GitHub listed only CI and zero deployments. No deployment workflow is present in the repository.

Technical review, manual screen-reader and real-device assessment remain outstanding. Legal/regulatory content, brand identity, product terms, membership fees, official domain and publication/indexing require approval. No merge, launch or indexing authorisation is implied.
