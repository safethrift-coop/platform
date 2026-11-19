# T01 — Repository and Governance Foundation

- **Disposition:** FORMALLY ACCEPTED
- **Acceptance date:** 2026-11-19
- **Assessed baseline:** `365edd2d0c7aa3d0c2a32287fef6e03051554d7b`
- **Repository:** [safethrift-coop/platform](https://github.com/safethrift-coop/platform)

The user authorized formal acceptance of T01 after the completed verification-first
assessment. This record documents that decision against the original master plan
and the independently verified, approved R04 governance configuration. Acceptance
applies only to T01.

## Original requirements and dependencies

The [original master plan](master-plan/Safethrift-T01-T53-Original-Master-Plan.txt)
is authoritative and contains T01–T52. Its filename does not introduce T53. The
original T01 definition is:

> Create GitHub organisation and monorepo
>
> One repo with /apps/api (NestJS), /apps/web (Next.js), /packages/prisma (shared schema). Enable branch protection on main: require PR + passing CI before merge.

T01 has **no original dependencies**. Its requirements are the organisation-owned
monorepo, the three specified package locations, and main-branch protection
requiring pull requests and passing CI before merge. The original plan, milestone
numbering, acceptance criteria, dependencies and product scope are unchanged.

## Verified acceptance evidence

The assessment inspected the repository structure, workspace configuration,
[CI workflow](../.github/workflows/ci.yml), GitHub repository metadata, full
branch-protection settings and actual CI check-run data. Full protection was read
through the GitHub CLI; an independent connector branch read corroborated
required-check enforcement for everyone.

| Criterion | Result | Verified evidence |
| --- | --- | --- |
| Organisation-owned repository `safethrift-coop/platform` | PASS | GitHub identifies `safethrift-coop` as an organisation owning this repository. |
| Required monorepo structure | PASS | `/apps/api` contains the NestJS application; `/apps/web` contains the Next.js application; `/packages/prisma` contains the shared Prisma schema. The pnpm workspace includes `apps/*` and `packages/*`. |
| Default branch `main` | PASS | Repository metadata identifies `main`; the assessed local and remote baseline is `365edd2d0c7aa3d0c2a32287fef6e03051554d7b`. |
| Required PR protection | PASS | The required-pull-request rule remains enabled on `main`, with zero required approving reviews under the approved single-maintainer policy. |
| Required CI check `Lint, typecheck, and test` | PASS | The exact workflow job/check name is required by main-branch protection. |
| GitHub Actions application ID `15368` | PASS | The required check is bound to app ID `15368`; actual check-run data identifies its producer as `github-actions`. |
| Successful CI run `44421378960` | PASS | The run completed successfully for the assessed baseline and produced the required successful check. |
| Administrator enforcement enabled | PASS | `enforce_admins.enabled` is `true`; independent branch metadata reports required-check enforcement level `everyone`. |
| Force pushes disabled | PASS | `allow_force_pushes.enabled` is `false`. |
| Branch deletion disabled | PASS | `allow_deletions.enabled` is `false`. |

The successful [CI run 44421378960](https://github.com/safethrift-coop/platform/actions/runs/44421378960)
ran for commit `365edd2d0c7aa3d0c2a32287fef6e03051554d7b`. Its actual
[check run](https://github.com/safethrift-coop/platform/actions/runs/44421378960/job/135214954185)
is named `Lint, typecheck, and test`, was produced by GitHub Actions app `15368`,
and has conclusion `success`. CI success and required-check enforcement were
verified separately; the passing run was not treated as proof of enforcement.

The approved R04 configuration requires pull requests, zero approving reviews,
the specified CI check and application binding, and enforcement for administrators.
Zero approvals accommodates the sole maintainer's lack of an independent reviewer.
The original T01 wording does not require an independent approving review. No
additional ruleset was observed, and unrelated protection settings were preserved.

## Historical governance exception

R12 commit `365edd2` (`fix(prisma): align local database fallback port`) was
historically pushed directly to `main`. The push output reported that the
pull-request requirement was bypassed. The historical push output was supplied by
the user; the pre-remediation protection inspection independently established that
administrator exemption existed at that time.

R04 subsequently enabled administrator enforcement, retained the PR requirement,
bound the required CI check to GitHub Actions app `15368`, and adopted the approved
zero-approval policy. The historical direct push remains a **governance exception**
and is **not retroactively compliant**. Current protection does not conceal or
rewrite that history.

## Verification limitation

No disposable enforcement-test PR, failing-check merge attempt, or push-denial test
was performed. End-to-end rejection behaviour was **not independently tested**.
This record makes no claim that such tests ran.

The configured branch protection and actual successful CI check evidence satisfy
the original T01 requirements. The assessment distinguishes those inspected
settings and execution results from unperformed rejection testing. The acceptance
document's normal feature-branch PR is a documentation workflow, not an
end-to-end enforcement test, and no automatic merge is authorized.

## Formal acceptance decision and scope

All original T01 acceptance criteria passed. T01 has no original dependencies,
and the approved R04 governance configuration was independently verified.
**T01 is formally accepted on 2026-11-19.**

This acceptance applies **only to T01**. **T06 remains unaccepted.** Its technical
service and startup-command criteria passed, but its original dependency on T01
required formal T01 acceptance first. T06 requires a separate formal acceptance
decision after this T01 acceptance record completes its authorized PR workflow.
This document does not record T06 acceptance.

The existing unstaged root `package.json` development-services addition is outside
this documentation change and must remain unstaged and uncommitted here. No
master-plan, source, workflow, schema, migration, service or database change is part
of this acceptance record.
