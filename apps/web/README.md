# Safethrift public website (T39)

Next.js 16 App Router, React 19, TypeScript and Tailwind 4 in the existing pnpm monorepo. All five public pages are statically rendered. No backend or financial-service integration is required.

Use the supported Node 22 LTS line (`nvm install` then `nvm use` reads `.nvmrc`). CI reads that same file; pnpm remains pinned to 10.33.0. Local verification used Node 22.21.1. Deployment should use a current Node 22 patch (at least 22.12 for the existing Prisma toolchain); no hosted runtime has been changed by this work.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @safethrift/web dev
pnpm --filter @safethrift/web typecheck
pnpm --filter @safethrift/web lint
pnpm --filter @safethrift/web build
pnpm --filter @safethrift/web test:production
```

Development uses http://localhost:2025. `test:production` starts the built site on port 2026, runs thirteen route/content/SEO configuration tests, then stops its server. Override `TEST_PORT` if needed. `pnpm --filter @safethrift/web test` targets an already-running server (`TEST_BASE_URL`, default http://localhost:2025).

For browser verification, start the production site (`pnpm --filter @safethrift/web exec next start --port 2025`) and run `pnpm --filter @safethrift/web test:browser`. This requires Node 22 for its native WebSocket and uses local Google Chrome and the dev-only axe-core package; set `CHROME_BIN` for another Chromium executable and `TEST_BASE_URL` for another local port. Screenshots, exact axe findings, composited text contrast samples and interaction styles go to `TEST_ARTIFACTS_DIR` (default `/tmp/safethrift-t39-browser`). The script checks every public page at 320, 375, 390, 768, 1024, 1440 and 1920 pixels, then exercises mobile menu, Escape/focus restoration, FAQ keyboard activation, skip link and reduced motion. Chrome is launched with a temporary profile and `--no-sandbox` for controlled local/CI execution; do not point this test at untrusted content.

Routes: `/`, `/about`, `/products`, `/membership`, `/knowledge-centre`; generated `/robots.txt`, `/sitemap.xml`, `/opengraph-image`; branded 404.

Content is kept in `src/lib/content.ts` and the page files. Shared layout, product comparison cards, detailed product sections, connected journeys and resource cards are in `src/components/marketing.tsx`; decorative vector icons are in `src/components/icon.tsx`; the header is the only client component. The wordmark is text, not a claimed approved logo. The decorative hero uses CSS; fonts are local system fonts, so builds do not download fonts or photographs. No analytics, external embeds, data collection forms or cookies are introduced by this implementation.

## Publication configuration

These are optional **build-time** settings, not secrets. No new environment file is required.

- `SITE_URL`: the verified HTTPS origin only, for example `https://your-approved-domain.example`. Paths, credentials, HTTP, loopback/localhost origins, query strings and fragments are rejected. Rebuild after changing it.
- `SITE_INDEXING_ENABLED=true`: enable only after content and publication approval. Requires `SITE_URL`. Defaults to noindex/nofollow with robots disallow.

Without a confirmed `SITE_URL`, canonical URLs are omitted and the sitemap has no URL entries. Without an origin, Open Graph URL/image and Twitter image fields are omitted; text social metadata remains available using a summary card. The image endpoint still works locally. The image is an ordinary static route rather than a file-convention metadata image, so Next.js cannot automatically inject a localhost image URL. A verified origin generates canonical/social URLs and all five sitemap entries. Setting the origin does not itself enable indexing. Robots rules are crawler requests, not access control; previews that need confidentiality require hosting authentication.

`TEST_SITE_URL` and `TEST_INDEXING_ENABLED` tell the production-output tests which build configuration to expect; they do not configure the application. Unit tests cover development, production and preview without an origin, configured preview/production, explicit indexing approval and invalid origins independently. Production HTTP tests reject localhost social URLs and check absolute images when `TEST_SITE_URL` is supplied.

A configured production smoke test can use a reserved example origin without publishing anything:

```sh
pnpm --filter @safethrift/web exec env SITE_URL=https://approved.example SITE_INDEXING_ENABLED=true next build
pnpm --filter @safethrift/web exec env TEST_SITE_URL=https://approved.example TEST_INDEXING_ENABLED=true node tests/production-check.mjs
```

Rebuild with the actual desired settings afterwards. Normal unconfigured builds remain non-indexable.

## Content approval

The supplied materials describe proposals and include unverified operational and legal claims. Public copy therefore identifies the organisation and services as in development. Product names and purpose statements follow the business materials. Descriptive copy explains intentions without finalising financial terms. The source lists four Knowledge Centre categories; “Explore All Materials” is their section label. Categories are status cards until real materials exist.

No approved privacy notice, terms, biographies or official contact channel were supplied. No fictional legal pages or dead links are published. The proposed £30 individual / £50 family annual fees are withheld until approved. Incorporation, CIC structure, director appointments, governance rights, financial-services permissions, deposit protection, all product terms and brand decisions require review. See the full [T39 report](../../docs/T39-report.md) and [local PR description](../../docs/T39-pull-request.md).

Registration is T40; dashboard is T41; loan UI is T42; admin UI is T43. None is part of this site. No changes are made to Prisma, payments, authentication or backend business logic.

## Accessibility evidence and visual review

Primary content uses 16px or larger text; metadata stays smaller. Product cards use consistent purpose/benefit labels and distinct coordinated icon panels. At intermediate widths they become horizontal cards; small screens stack them vertically. The homepage and membership use the same semantic ordered journey component. Shared focus styles use a dark outline surrounded by a cream ring, visible on light and dark sections. Hover transitions respect reduced motion.

Browser evidence includes sRGB relative-luminance ratios for rendered text against alpha-composited ancestor backgrounds. Solid backgrounds resolve the decorative illustration-label ambiguity; SVG arrows and CSS status dots replace ambiguous standalone glyphs. Exact remaining axe items, if any, must be reviewed rather than counted as passes. This measurement method is appropriate to the site's solid text surfaces, not a general pixel-sampling solution for arbitrary overlapping images. Review screenshots as well as the measurements.

Final verification details, runtime-source links, before/after explanations, screenshot links and outstanding approvals are in the T39 report. No trackers, forms or additional service integrations are introduced.
