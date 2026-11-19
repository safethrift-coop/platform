# T06 — Development Services — Acceptance Evidence Record

- **Disposition:** **IMPLEMENTATION MERGED AND CI-VERIFIED — ACCEPTANCE EVIDENCE UPDATED FOR REVIEW.**
- **Acceptance evidence:** Updated and submitted for review through a separate documentation pull request
- **Formal acceptance decision:** Pending review, approval and merge of this documentation pull request
- **Evidence update date:** 2026-11-19, Africa/Lagos (UTC+01:00)
- **Historical reassessment date:** 2026-11-19, Africa/Lagos (UTC+01:00), before the implementation merge
- **Repository:** https://github.com/safethrift-coop/platform
- **Historically inspected checkout:** /home/princewill/Projects/safethrift-coop/platform
- **Historically inspected branch:** docs/t01-repository-governance-acceptance
- **Historically inspected HEAD:** e1256f46a3970fa6838e4ffbd8b6bcd3ad5631af
- **Live main HEAD at the original reassessment:** fbd79cb468e39b302c8eb7afd59187af40eddbab
- **Historical working-tree scope:** The inspected repository included the previously approved, unstaged root package.json development-services addition.

This record preserves the T06 reassessment dated 2026-11-19 against the original
master plan and adds a dated update confirming the implementation merge,
successful CI and committed startup script. Acceptance evidence is updated and
submitted for review. Formal T06 acceptance remains pending review, approval and
merge of this documentation pull request.

Runtime and preservation findings remain evidence from the original reassessment.
Preparation of the original acceptance-evidence PR used a separate clean checkout
based on verified live main commit
`fbd79cb468e39b302c8eb7afd59187af40eddbab`, on branch
`docs/t06-development-services-acceptance`. The original checkout and its approved
unstaged package.json change were preserved; that change was excluded from that
documentation PR and subsequently merged through implementation PR #5.

**Implementation merge evidence update — 2026-11-19**

Live GitHub PR metadata confirms that
[PR #5 — feat(t06): add development services script](https://github.com/safethrift-coop/platform/pull/5)
was merged into `main` at `2026-11-19T21:22:50Z`:

| Item | Verified evidence |
|---|---|
| Implementation branch | `feat/t06-dev-services-script` |
| Feature commit | `68b69eba5027f3b2db45e36fa327f47e6cc79f3f` |
| Merge commit | [`112fc651a70bb504731dbfb00eb439bacbc32c86`](https://github.com/safethrift-coop/platform/commit/112fc651a70bb504731dbfb00eb439bacbc32c86) |
| Latest fetched `origin/main` for this update | `112fc651a70bb504731dbfb00eb439bacbc32c86` |
| Documentation branch | `docs/t06-acceptance-after-implementation-merge` |
| Separate documentation worktree | `/tmp/safethrift-platform-t06-acceptance-after-merge` |

The existing GitHub Actions runs were independently read from GitHub and verified
against their branch, commit, event, run number, status and conclusion:

| CI evidence | Event | Branch | Commit | Status | Conclusion |
|---|---|---|---|---|---|
| [Feature CI #68](https://github.com/safethrift-coop/platform/actions/runs/44616937741) | `pull_request` | `feat/t06-dev-services-script` | `68b69eba5027f3b2db45e36fa327f47e6cc79f3f` | `completed` | `success` |
| [Merge/main CI #69](https://github.com/safethrift-coop/platform/actions/runs/44618181311) | `push` | `main` | `112fc651a70bb504731dbfb00eb439bacbc32c86` | `completed` | `success` |

GitHub returned the last-update times `2026-11-19T21:19:53Z` for CI #68 and
`2026-11-19T21:26:52Z` for CI #69. Verification used
`mcp__codex_apps__github_get_pr_info` for PR #5 and
`mcp__codex_apps__github_fetch` for these existing run endpoints:

```text
https://api.github.com/repos/safethrift-coop/platform/actions/runs/44616937741
https://api.github.com/repos/safethrift-coop/platform/actions/runs/44618181311
```

After fetching `origin/main`, read-only inspection of
[the root package.json at the merge commit](https://github.com/safethrift-coop/platform/blob/112fc651a70bb504731dbfb00eb439bacbc32c86/package.json)
confirmed that its JSON parses and that the exact approved script is committed
on `main`:

```json
"dev:services": "docker compose -f docker-compose.yml up -d --no-recreate postgres redis mailhog"
```

The previous missing-script limitation is **resolved** by PR #5 and its merge.
The definition has no `predev:services` or `postdev:services` hook. This update
changes only `docs/T06-development-services-acceptance.md`; the original checkout
and its existing unstaged package.json change remain preserved.

This update verified repository files and existing GitHub merge/CI evidence only.
No post-merge runtime verification, startup-command execution or persistence test
was performed, and no runtime services or database contents were changed. CI
success is recorded as CI evidence; it does not establish a new execution of
`npm run dev:services` or a restart-based persistence test. No CI run was triggered
or rerun as part of the evidence inspection.

**Historical reassessment evidence — 2026-11-19, before implementation merge**

The sections from "Authoritative original requirements" through "Data preservation
and non-destructive verification" below preserve the original reassessment evidence.
Their observations, commands, output, working-tree state and references to
"current" or "live main" describe the state at that reassessment, before PR #5
merged. Runtime probes and preservation comparisons in those sections were not
repeated for this documentation update. The earlier startup-command execution
remains separately dated historical evidence from 2026-11-18 (UTC).

**Authoritative original requirements**

The authoritative source is
[the original master plan](master-plan/Safethrift-T01-T53-Original-Master-Plan.txt),
lines 30–35.

The exact command used to locate the definition was:

```sh
sed -n '30,35p' docs/master-plan/Safethrift-T01-T53-Original-Master-Plan.txt
```

Exact output:

```text
T06
Set up Docker Compose for local development
docker-compose.yml with postgres:16, redis:7-alpine, and mailhog (local email testing). All services on a named network. Volume mounts for Postgres data persistence. Add npm run dev:services script.
Infrastructure
Needs:
T01
```

T06 requires PostgreSQL 16, Redis 7 Alpine, MailHog, a shared named network,
persistent PostgreSQL volume mounting and a root npm run dev:services script.
Its sole declared dependency is T01.

No additional acceptance requirements, milestone renumbering or master-plan
changes were introduced.

**T01 dependency acceptance on main**

The GitHub connector fetched:

```text
Tool: mcp__codex_apps__github_fetch_file
repository_full_name: safethrift-coop/platform
path: docs/T01-repository-governance-acceptance.md
ref: main
```

The returned document blob SHA was:

```text
7304d0914674414492bb2b076677e408cf355799
```

The document records:

```text
- **Disposition:** FORMALLY ACCEPTED
- **Acceptance date:** 2026-11-19

**T01 is formally accepted on 2026-11-19.**
```

The authoritative merged document is available at:

https://github.com/safethrift-coop/platform/blob/main/docs/T01-repository-governance-acceptance.md

T01 was formally accepted and its record merged through
[PR #3](https://github.com/safethrift-coop/platform/pull/3). The merge is
`fbd79cb468e39b302c8eb7afd59187af40eddbab`.
[Main CI run #65](https://github.com/safethrift-coop/platform/actions/runs/44503881038)
completed successfully on that exact merge commit.

Main-history membership was independently checked through:

```text
Tool: mcp__codex_apps__github_compare_commits
repo_full_name: safethrift-coop/platform
base: fbd79cb468e39b302c8eb7afd59187af40eddbab
head: main
```

Relevant returned values:

```json
{
  "status": "identical",
  "ahead_by": 0,
  "behind_by": 0,
  "total_commits": 0,
  "base_commit": {
    "sha": "fbd79cb468e39b302c8eb7afd59187af40eddbab"
  },
  "merge_base_commit": {
    "sha": "fbd79cb468e39b302c8eb7afd59187af40eddbab"
  }
}
```

Therefore the expected merge commit is the current live main HEAD.

The merge metadata was read with:

```sh
gh api --method GET repos/safethrift-coop/platform/commits/fbd79cb468e39b302c8eb7afd59187af40eddbab --jq '{sha, parents: [.parents[].sha], message: .commit.message, date: .commit.committer.date, files: [.files[] | {filename,status,additions,deletions}]}'
```

Returned values, formatted for readability:

```json
{
  "sha": "fbd79cb468e39b302c8eb7afd59187af40eddbab",
  "parents": [
    "365edd2d0c7aa3d0c2a32287fef6e03051554d7b",
    "e1256f46a3970fa6838e4ffbd8b6bcd3ad5631af"
  ],
  "message": "Merge pull request #3 from safethrift-coop/docs/t01-repository-governance-acceptance\n\ndocs(t01): record repository governance acceptance",
  "date": "2026-11-19T10:14:58Z",
  "files": [
    {
      "filename": "docs/T01-repository-governance-acceptance.md",
      "status": "added",
      "additions": 103,
      "deletions": 0
    }
  ]
}
```

The associated main CI run was inspected with:

```sh
gh api --method GET repos/safethrift-coop/platform/actions/runs/44503881038 --jq '{id, name, event, status, conclusion, head_branch, head_sha, run_number, run_attempt, created_at, updated_at, html_url}'
```

Returned values, formatted for readability:

```json
{
  "id": 44503881038,
  "name": "CI",
  "event": "push",
  "status": "completed",
  "conclusion": "success",
  "head_branch": "main",
  "head_sha": "fbd79cb468e39b302c8eb7afd59187af40eddbab",
  "run_number": 65,
  "run_attempt": 1,
  "created_at": "2026-11-19T10:15:01Z",
  "updated_at": "2026-11-19T10:18:07Z",
  "html_url": "https://github.com/safethrift-coop/platform/actions/runs/44503881038"
}
```

The GitHub connector independently inspected that run's jobs. Job
135490321857, named "Lint, typecheck, and test", returned status "completed"
and conclusion "success"; all returned steps were successful.

The existing CI run was inspected without triggering or rerunning it.
T01 acceptance was established from live main, its merged acceptance document
and associated merge CI.

**Criterion-by-criterion assessment**

| Criterion | Evidence | Result |
|---|---|---|
| T01 dependency formally accepted | Formal acceptance document exists on live main; expected merge is current main HEAD; CI run 44503881038 completed successfully for that merge | PASS |
| PostgreSQL 16 | Effective image postgres:16-alpine; running and healthy; pg_isready succeeds; server reports 16.13 and server_version_num 160013 | PASS |
| Redis 7 Alpine | Effective image redis:7-alpine; running and healthy; runtime reports 7.4.7; Alpine release 3.21.6; authenticated PING returns PONG | PASS |
| MailHog | Effective image mailhog/mailhog:latest; running; SMTP responds on host port 1025; web UI returns HTTP 200 on host port 8025 | PASS |
| Shared named network | Effective Compose network platform_default; all three containers attached to network eeaea7e9137a5171c717fd43bb2cf3a82248244341df66f3ef45604dab189470 | PASS |
| Persistent PostgreSQL volume | Effective named volume platform_postgres_data; existing volume mounted at /var/lib/postgresql/data; server reports that data directory; creation metadata preserved | PASS |
| npm run dev:services | Exact approved root script exists in the preserved working-tree addition; targets only postgres, redis and mailhog; no pre/post hooks; current configuration hashes match existing containers; historical invocation exited 0 | PASS |

**Repository state and preservation**

The initial and final repository observations agreed:

| Item | Observed state |
|---|---|
| Current branch | docs/t01-repository-governance-acceptance |
| HEAD | e1256f46a3970fa6838e4ffbd8b6bcd3ad5631af |
| Local main | 365edd2d0c7aa3d0c2a32287fef6e03051554d7b |
| Local origin/main | 365edd2d0c7aa3d0c2a32287fef6e03051554d7b |
| Live GitHub main | fbd79cb468e39b302c8eb7afd59187af40eddbab |
| Staged changes | None |
| Unstaged changes | Only the approved one-line package.json addition |
| Non-ignored untracked files | None |
| git diff --check | Exit 0; no output |
| Proposed T06 acceptance document | Not created during reassessment |

Local main and origin/main are stale. No fetch, checkout, reset, stash or
local-ref update was performed.

The working-tree status remained:

```text
 M package.json
```

The preserved diff is:

```diff
diff --git a/package.json b/package.json
index 8b34989..8c8b12f 100644
--- a/package.json
+++ b/package.json
@@ -4,6 +4,7 @@
   "description": "",
   "main": "index.js",
   "scripts": {
+    "dev:services": "docker compose -f docker-compose.yml up -d --no-recreate postgres redis mailhog",
     "test": "echo \"Error: no test specified\" && exit 1"
   },
   "keywords": [],
```

Initial and final SHA-256 values matched:

| File or index | SHA-256 |
|---|---|
| package.json | 0472b8f4be5a3fdc0ca67e00861ae9f9d46345ce6ac39addb471253d9aeed2fa |
| docker-compose.yml | 23915c6a8e7bc15159386982d9bb3a38880ed1b49b6b400da22cb3e49c65e880 |
| Original master plan | fc17ea5e60761a885f7c2d4cb42f0b61a43f8f5cda12c05c856541cce9927fa0 |
| T01 acceptance document | 906961a712a477c49299fe9cc651007f30200490146b93dfe083466cfc92fccb |
| Git index | b3deeaacd1b0c44f0651f577c11ae428e2ced20c06371391886f37b42e8e9e1e |

The package.json addition remains unstaged and uncommitted. It was not
overwritten, discarded or included in another change.

**Effective Docker Compose configuration**

Read-only configuration commands included:

```sh
docker context show
docker compose version
docker compose -f docker-compose.yml config --services
docker compose -f docker-compose.yml config --format json
docker compose -f docker-compose.yml config --hash '*'
```

Observed context and version:

```text
default
Docker Compose version v5.8.0
```

Exact service-list output:

```text
mailhog
postgres
redis
```

Relevant effective configuration values:

| Service | Image | Container name | Published host → container TCP ports | Volume |
|---|---|---|---|---|
| postgres | postgres:16-alpine | safethrift_postgres | 5434 → 5432 | platform_postgres_data → /var/lib/postgresql/data |
| redis | redis:7-alpine | safethrift_redis | 6378 → 6379 | platform_redis_data → /data |
| mailhog | mailhog/mailhog:latest | safethrift_mailhog | 1025 → 1025; 8025 → 8025 | None |

The effective Compose project name is "platform". Its default network has the
effective name "platform_default", and all three services use that network.

The PostgreSQL volume is a named volume with the local driver. All three
services have restart policy "unless-stopped".

Configured health checks:

- PostgreSQL: CMD-SHELL, pg_isready -U safethrift -d safethrift_dev.
- Redis: CMD, redis-cli -a <existing configured password> ping.
- Both checks use interval 10 seconds, timeout 5 seconds and 5 retries.
- MailHog has no configured Docker health check; SMTP and HTTP probes supplied
  independent endpoint evidence.

The existing Redis server command enables append-only persistence and requires
its existing configured password. Credentials were redacted from reported
configuration evidence and were not changed.

Exact configuration-hash output:

```text
mailhog b0e8ba51c74752b9e2b5dba7b7ab6e8d2d1b8cfb300c5c245220205503741a13
postgres 41883edfbb997aa6c0e5ec2835330a73606bfb68cc6f41b4efc1ab1e9ebddaf3
redis fd7010a6ccaae1cf1ef73d7ec649264c664ddc97f44b98dfecc5a74d543cfb29
```

Each value exactly matches the corresponding existing container's
com.docker.compose.config-hash label. Container labels also identify project
"platform", the expected service names and the inspected docker-compose.yml.

The configuration resolves to the existing containers, network and named
volumes. No configuration change or lifecycle operation was performed.

**Runtime container identities and ports**

The read-only container metadata command was:

```sh
docker inspect --type container --format '{"Id":{{json .Id}},"Name":{{json .Name}},"Created":{{json .Created}},"Image":{{json .Config.Image}},"ImageId":{{json .Image}},"State":{{json .State}},"RestartCount":{{json .RestartCount}},"Mounts":{{json .Mounts}},"Networks":{{json .NetworkSettings.Networks}},"Ports":{{json .NetworkSettings.Ports}},"PortBindings":{{json .HostConfig.PortBindings}},"RestartPolicy":{{json .HostConfig.RestartPolicy}},"Labels":{{json .Config.Labels}}}' safethrift_postgres safethrift_redis safethrift_mailhog
```

Observed full container IDs:

```text
safethrift_postgres
41c60472f1e30b6bac486d5854eeabde6ca682cc2537a6772183e808fc93c7cb

safethrift_redis
90b28372d261e0ca06d8c512f0a3c351dc3f63b929ac5fa0199430b37257cbae

safethrift_mailhog
2e943f22f285e350a1bca6e5cd53dced3c1eff85fd41c582cb7aca1d6d8f8ccc
```

Observed immutable image IDs:

```text
PostgreSQL:
sha256:0001755f47e38bfd163788ccc543387b7f3da35a01b38a7c2ca1cd0277f06b5d

Redis:
sha256:e08bd8d5a6774025cff22e5db8361f6a5d023811e84d77d0033e47d44970cc94

MailHog:
sha256:4de68494cd0dbcbc141beb755eedce4d328ab10b2d1061d74c2489e0af5f28a9
```

Final runtime observations:

| Container | State | Health | Failing streak | RestartCount |
|---|---|---|---:|---:|
| safethrift_postgres | running | healthy | 0 | 0 |
| safethrift_redis | running | healthy | 0 | 0 |
| safethrift_mailhog | running | No configured health check | N/A | 0 |

Container start times were:

```text
PostgreSQL: 2026-11-19T10:08:36.617942174Z
Redis:      2026-11-19T10:08:36.588130854Z
MailHog:    2026-11-19T10:08:36.647638393Z
```

These start times precede this reassessment and remained unchanged during it.

Docker inspection showed each configured host port published on both
`0.0.0.0` and `::`:

```text
PostgreSQL: 5434 → 5432/tcp
Redis:      6378 → 6379/tcp
MailHog:    1025 → 1025/tcp
MailHog UI: 8025 → 8025/tcp
```

**PostgreSQL runtime verification**

Command:

```sh
docker exec safethrift_postgres pg_isready -U safethrift -d safethrift_dev
```

Exit code: 0.

Exact output:

```text
/var/run/postgresql:5432 - accepting connections
```

Server version and data directory were read in a session configured to default
to read-only transactions:

```sh
docker exec -e 'PGOPTIONS=-c default_transaction_read_only=on' safethrift_postgres psql -X -U safethrift -d safethrift_dev -v ON_ERROR_STOP=1 -Atc 'SHOW server_version; SHOW server_version_num; SHOW data_directory; SHOW transaction_read_only;'
```

Exit code: 0.

Exact output:

```text
16.13
160013
/var/lib/postgresql/data
on
```

The running server therefore reports PostgreSQL major version 16, and its data
directory matches the persistent-volume mount.

Only SHOW statements were executed. No table rows, schemas or migration records
were read or modified by this SQL probe.

**Redis runtime verification**

Unauthenticated probe:

```sh
docker exec safethrift_redis redis-cli --raw PING
```

Observed response:

```text
NOAUTH Authentication required.
```

The authenticated probe used the existing password read from the container's
configured --requirepass argument. The password was supplied only to the
temporary client process through REDISCLI_AUTH and was not printed or changed.

Command, with the credential redacted:

```sh
docker exec -e 'REDISCLI_AUTH=<existing configured password>' safethrift_redis redis-cli --no-auth-warning --raw PING
```

Exit code: 0.

Exact output:

```text
PONG
```

Runtime server information was read with:

```sh
docker exec -e 'REDISCLI_AUTH=<existing configured password>' safethrift_redis redis-cli --no-auth-warning --raw INFO server
```

Relevant exact output lines:

```text
redis_version:7.4.7
redis_mode:standalone
tcp_port:6379
```

Alpine release command:

```sh
docker exec safethrift_redis cat /etc/alpine-release
```

Exit code: 0.

Exact output:

```text
3.21.6
```

No Redis keys or persistent settings were changed.

**MailHog endpoint verification**

Web UI command:

```sh
curl --noproxy '*' --silent --show-error --max-time 10 --dump-header - --output /dev/null http://127.0.0.1:8025/
```

Exit code: 0.

Exact returned headers:

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Date: Thu, 19 Nov 2026 10:37:26 GMT
Transfer-Encoding: chunked
```

The SMTP probe used Python smtplib.SMTP(timeout=10) and these calls:

```python
smtp.connect('127.0.0.1', 1025)
smtp.ehlo('t06-reassessment.invalid')
smtp.noop()
smtp.quit()
```

Exact observed response values:

```text
CONNECT: 220
mailhog.example ESMTP MailHog

EHLO: 250
Hello t06-reassessment.invalid
PIPELINING
AUTH PLAIN

NOOP: 250
Ok

QUIT: 221
Bye
```

No MAIL FROM, RCPT TO or DATA command was issued. No email was submitted.

Runtime endpoint probes completed at 2026-11-19T10:37:26.069781Z.

**Shared network and persistent-volume evidence**

Read-only resource commands included:

```sh
docker network inspect platform_default
docker volume inspect platform_postgres_data platform_redis_data
docker volume ls --format '{{.Name}}'
```

Observed network metadata:

```text
Name: platform_default
ID: eeaea7e9137a5171c717fd43bb2cf3a82248244341df66f3ef45604dab189470
Driver: bridge
Scope: local
Created: 2026-04-21T02:38:50.785479764+01:00
Subnet: 172.28.0.0/16
Gateway: 172.28.0.1
```

All three container inspections report that same network ID. Network inspection
independently lists all three containers:

| Container | IPv4 address |
|---|---|
| safethrift_postgres | 172.28.0.2/16 |
| safethrift_mailhog | 172.28.0.3/16 |
| safethrift_redis | 172.28.0.4/16 |

Observed PostgreSQL mount:

```text
Type: volume
Name: platform_postgres_data
Driver: local
Source: /var/lib/docker/volumes/platform_postgres_data/_data
Destination: /var/lib/postgresql/data
RW: true
```

Observed named-volume metadata:

| Volume | Driver | Scope | CreatedAt | Mountpoint |
|---|---|---|---|---|
| platform_postgres_data | local | local | 2026-04-21T02:38:18+01:00 | /var/lib/docker/volumes/platform_postgres_data/_data |
| platform_redis_data | local | local | 2026-04-21T02:38:18+01:00 | /var/lib/docker/volumes/platform_redis_data/_data |

The existing Redis volume remains mounted at /data. Its preservation was
checked without adding Redis persistence as an original T06 requirement.

The complete sorted Docker volume-name inventory contains 54 names.
Its SHA-256, calculated over newline-separated sorted names with a final
newline, is:

```text
5b13f952fecf8081dbfc6c878709b692c0c99f69e81a7f400ae58dfd20f8d7e1
```

The final resource snapshot completed at 2026-11-19T10:44:13.444808Z.
Comparison with the initial snapshot confirmed:

```text
All three container identities and configurations unchanged: true
All three container start times unchanged: true
Network metadata unchanged: true
Named-volume metadata unchanged: true
All 54 volume names unchanged: true
```

Mounts, network attachments, port mappings, restart policies and configuration
labels were included in the comparison.

**Root npm command and safe verification**

The inspected root package.json contains:

```json
"dev:services": "docker compose -f docker-compose.yml up -d --no-recreate postgres redis mailhog"
```

Read-only Node inspection confirmed:

```json
{
  "rootPackage": "safethrift-platform",
  "worktreeScript": "docker compose -f docker-compose.yml up -d --no-recreate postgres redis mailhog",
  "matchesApprovedCommand": true,
  "requiredServices": [
    "postgres",
    "redis",
    "mailhog"
  ],
  "preHook": null,
  "postHook": null,
  "executed": false
}
```

The script targets exactly the required development services and retains the
previously approved --no-recreate option. The effective service list contains
only those services, and their configuration hashes match the existing
containers.

The script is absent from committed HEAD and live main. A direct GitHub fetch
of package.json at ref main returned blob
8b34989976b9ed8c195753df72e8599ebb6efe32 and only the existing test script.
The PASS result for this criterion applies to the expressly preserved
working-tree addition.

The npm command was not executed during this reassessment. Compose up remains
a lifecycle operation and could start or create resources if runtime state
changed. Current read-only verification established the script definition,
targets, configuration and running services without taking that risk.

**Historical verification comparison**

The earlier R08/T06 evidence was located in the retained local session log:

```text
/home/princewill/.codex/sessions/2026/11/18/rollout-2026-11-18T22-47-22-01a1f0a0-f308-7e92-a63e-1192060c7f27.jsonl
```

Relevant evidence locations:

```text
Line 569: Historical pre-startup resource and preservation evidence
Line 597: Historical post-startup evidence, 2026-11-18T23:51:33.351Z
Line 616: Historical verification report, 2026-11-18T23:53:35.866Z
```

The script was historically executed successfully on **2026-11-18 (UTC)**,
exiting **0**, with the exact approved command. Its recorded output was:

```text
> safethrift-platform@1.0.0 dev:services
> docker compose -f docker-compose.yml up -d --no-recreate postgres redis mailhog

Container safethrift_postgres Running
Container safethrift_redis Starting
Container safethrift_mailhog Starting
Container safethrift_redis Started
Container safethrift_mailhog Started
```

That execution is historical evidence; it was not repeated.

Comparison of current observations with the retained historical metadata found:

| Observation | Historical evidence | Current observation |
|---|---|---|
| PostgreSQL version | 16.13 | 16.13 |
| Redis version | 7.4.7 | 7.4.7 |
| MailHog endpoints | SMTP 1025; UI 8025 responding | Same ports; SMTP responses and HTTP 200 independently verified |
| Container IDs | Three recorded full IDs | All three match exactly |
| Shared network ID | eeaea7e9137a5171c717fd43bb2cf3a82248244341df66f3ef45604dab189470 | Exact match |
| Mounts and published ports | Recorded for all three containers | Exact match |
| Named-volume creation metadata | Both created 2026-04-21T02:38:18+01:00 | Exact match |
| Docker volume inventory | 54 names | All 54 names match exactly |
| npm command | Successful historical invocation | Same approved definition; not executed again |

Current start times are later than the historical verification and precede
this reassessment. Container identities and volume metadata remain the same.
No restart was performed during this reassessment.

The historical exercise reported unchanged row counts and content fingerprints
for the 21 original application tables plus _prisma_migrations, unchanged
schema metadata and unchanged content for two migration-history records.
Those findings remain historical. No new table fingerprints, row-count scans,
schema comparisons or migration-history comparisons were performed.

**Data preservation and non-destructive verification**

This reassessment used repository reads, GitHub GET requests, Compose
configuration resolution, Docker metadata inspection, PostgreSQL readiness
and read-only SHOW statements, Redis PING/INFO, HTTP GET and SMTP
EHLO/NOOP/QUIT.

It performed no:

- Database migrations, Prisma migrations, seeds, DDL or application-data writes.
- Table drops, truncation, recreation or modification.
- Container, network or volume creation, removal, recreation or reset.
- Service starts, stops or restarts.
- Compose down, volume removal, pruning or destructive cleanup.
- Application-source, service-configuration, environment-file or credential changes.
- GitHub settings or branch-protection changes.
- Staging, committing, pushing, merging or PR creation.
- Changes to the original master plan or T01 acceptance record.

The existing approved package.json change was preserved.

Initial and final file hashes, Git index hash, HEAD and working-tree status
matched. The final Git/file check completed at
2026-11-19T10:44:50.917511Z.

**Verification limitations and scope**

1. **Resolved after implementation merge:** At the original reassessment, the
   startup script was an approved, unstaged working-tree addition, absent from
   committed HEAD and live main. PR #5 merged it into `main` as
   `112fc651a70bb504731dbfb00eb439bacbc32c86`; the exact approved script is now
   committed on `main`, as verified in the dated update above.

2. npm run dev:services was not executed again during the original reassessment
   or this documentation update. Its definition, service targets, absent hooks,
   matching configuration hashes and runtime were verified during the original
   reassessment. The earlier successful execution remains historical evidence;
   this update adds committed-script and merge/CI evidence only.

3. MailHog has no configured Docker health check. SMTP and HTTP responses from
   the original reassessment supplied endpoint verification without submitting
   email. Those endpoint probes were not repeated after the implementation merge.

4. No persistence test involving a restart or recreation was performed during
   the original reassessment or this update. Persistent-storage evidence remains
   the reassessment's named-volume configuration, existing mount, server-reported
   data directory and preserved volume metadata.

5. Historical table fingerprints and migration-history comparisons were not
   repeated during the reassessment or this update. This record makes no new
   claim that application-table contents match the historical snapshot.

6. Initial sandboxed Docker and endpoint attempts were blocked by Docker-socket
   or network restrictions. Authorized read-only retries outside the sandbox
   succeeded and supplied the runtime evidence recorded here.

**Disposition and review gate**

**Implementation: merged and CI-verified.** PR #5 merged the exact approved
development-services script into `main`; feature CI #68 and merge/main CI #69
both completed successfully on their recorded commits.

**Acceptance evidence: updated and submitted for review.** The missing-script
limitation is resolved. Original runtime and preservation observations remain
dated historical evidence, with the remaining verification limitations above.

**Formal T06 acceptance: pending review, approval and merge of this documentation
pull request.** This update does not declare T06 formally accepted. Formal
acceptance remains pending this separate documentation PR's review, approval and
merge; automatic merging is not authorized.
