# CI/CD — smart-platform

Production-safe deployment pipeline built on GitHub Actions + GHCR + a single VPS
Compose stack. Deploys are **gated on CI**, ship **immutable Docker images**, run
**Prisma migrations explicitly**, and never build source code on the server.

```
push to main ─┐
workflow_dispatch ─┤  →  ci (checks)  →  container (GHCR image)  →  deploy (SSH to VPS)  →  notify
pull_request  ─┘                              ^ push only on main                  (summary/Slack)
```

## Pipeline jobs (`.github/workflows/main.yml`)

| Job         | Runs on                                | What it does                                                                                                                                                                                                                              |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci`        | push main/release, PR main, dispatch   | Lint, format, locale, Jest, build, types, `prisma migrate deploy` (against CI Postgres), Playwright e2e                                                                                                                                   |
| `container` | same, after `ci`                       | `docker build` (validates the Dockerfile); **pushes** to GHCR only for `main` pushes and manual deploys of the current commit. Tags: `sha-<40 hex>` (immutable) + `latest`. Skipped when a manual deploy supplies an existing `image_tag` |
| `deploy`    | main pushes + `workflow_dispatch` only | SSH deploy to the VPS: pull image → `prisma migrate deploy` → swap platform container → health poll                                                                                                                                       |
| `notify`    | always()                               | GitHub Actions run summary; optional Slack when `SLACK_WEBHOOK_URL` is set                                                                                                                                                                |

- PRs and `release` pushes can **never** deploy — they only build (Dockerfile validation).
- The manual `image_tag` input is validated against `^(latest|sha-[0-9a-f]{40})$`.
- The `deploy` job uses `environment: production` (can require manual approval) and a
  concurrency group so two deploys never run at the same time.

## GitHub secrets (configure ONCE)

Configure these in the repository **production environment**
(Settings → Environments → production → Environment secrets). If `deploy` is
required, secrets are better scoped to the environment than to the repo.

Required:

| Secret            | Value                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SSH_HOST`        | VPS hostname or IP (204.44.87.208)                                                                                                                                                        |
| `SSH_USER`        | Dedicated deploy user (e.g. `smart-deploy`), **not root** — see bootstrap                                                                                                                 |
| `SSH_PRIVATE_KEY` | Private key matching the public key installed for `SSH_USER`                                                                                                                              |
| `SSH_KNOWN_HOSTS` | Server host key line(s), e.g. from `ssh-keyscan 204.44.87.208` — **must be verified manually**, never pasted blind. Enables strict host checking (no `StrictHostKeyChecking=no` anywhere) |

Optional:

| Secret              | Value                                     |
| ------------------- | ----------------------------------------- |
| `SSH_PORT`          | Non-standard SSH port (default `22`)      |
| `SLACK_WEBHOOK_URL` | Enables the failure/summary Slack message |

**No GHCR token is needed in GitHub Actions** — image publication uses the built-in
`GITHUB_TOKEN` (`packages: write`). The **server** needs its own read-only GHCR PAT
(see bootstrap).

## One-time VPS bootstrap (operator steps)

1. **Deploy user:** `useradd -m smart-deploy && usermod -aG docker smart-deploy`, install
   the public half of `SSH_PRIVATE_KEY` in `/home/smart-deploy/.ssh/authorized_keys`.
   Never give the pipeline root.
2. **Compose v2:** verify `docker compose version` works under `smart-deploy`.
3. **GHCR login on the server** (read-only, scoped to this image):

   ```bash
   docker login ghcr.io -u <github-username> --password-stdin <<< '<fine-grained PAT with read:packages>'
   ```

4. **`.env`:** ensure `/var/www/multitenant-smart-and-pro/.env` exists and is
   `chmod 600` (the pipeline fails closed otherwise). Required runtime values:
   `DATABASE_URL`, `NEXTAUTH_URL`, `APP_URL`, `NEXTAUTH_SECRET`, `PORT=4002`,
   `ERP_API_URL`, `ERP_CLIENT_URL`, `ERP_BASE_DOMAIN`, `ERP_PLATFORM_API_KEY`,
   `EMAIL_ENABLED=true` (explicit email gate — deploy adds it idempotently if
   absent), auth/SMTP/Sentry/feature-flag values, and `PLATFORM_IMAGE_TAG`
   (set automatically by deploy).
   - **`DATABASE_URL` must use the Compose network hostname** (`postgres:5432`
     for the standalone file, or whatever alias the integrated stack exposes) —
     **not** `localhost:5433` (that is the host-side mapping, unreachable inside the container).
5. **Network:** `docker network create smart-network` (idempotent) — the standalone
   compose file and the integrated stack both attach to it.
6. **Service key:** run `docker compose -f /var/www/multitenant-smart-and-pro/docker-compose.yml config --services`
   and confirm the platform service is named `platform`. The deploy fails closed if
   the key is missing, so this only needs verifying once.
7. **Activate the override** (the pipeline uploads it, but the first pull is manual —
   or just trigger the workflow):

   ```bash
   cd /var/www/multitenant-smart-and-pro
   docker compose -f docker-compose.yml -f docker-compose.platform.override.yml pull platform
   docker compose -f docker-compose.yml -f docker-compose.platform.override.yml up -d --no-build platform
   ```

   This replaces the old `build: ./Platform/smart-platform` behavior — the server no
   longer compiles the kit.

## What a deploy does (exact order)

1. Guards: server reachable, docker + compose v2 present, `.env` exists and is `600`,
   tag matches `^(latest|sha-[0-9a-f]{40})$`, deploy dir + compose files present.
2. Backs up `.env` (`.env.bak.<timestamp>` — printed at the end for recovery).
3. Sets `PLATFORM_IMAGE_TAG=<tag>` idempotently in `.env`.
4. Adds `EMAIL_ENABLED=true` idempotently to `.env` **only if the key is absent**
   (the explicit email gate in `lib/email/sendEmail.ts` defaults to disabled;
   existing server `.env` files predate the flag). Opt out by adding
   `EMAIL_ENABLED=false` to the server `.env`.
5. `docker compose config` validates the merged stack; service key `platform` must exist.
6. `docker compose ... pull platform` — image only.
7. `docker compose ... run --rm --no-deps --no-build platform npx prisma migrate deploy`
   — **migrations run before the new container replaces the old one**.
8. `docker compose ... up -d --no-build platform` — swaps only the platform container.
   Never runs `down`, `--build`, or `--remove-orphans`: the rest of the stack (backend,
   SQL Server, front, postgres) is untouched.
9. Health poll: `http://127.0.0.1:5032/api/health` must return HTTP 200 **with
   `"db":{"ok":true}`** within ~60s. On failure: platform logs + `.env` backup path are printed.
10. `notify` summarizes the run.

### Health semantics (important)

`pages/api/health.ts` reports the **kit's** health: HTTP 200 + `db.ok` reflects Prisma.
`erp.ok=false` (ERP probe failing) does **not** fail deploys — it is an infra alerting
field, by design. Requiring only `db.ok=true` keeps the deploy gate honest.

## Migrations policy

- Production schema changes happen **only** via `prisma migrate deploy` in the pipeline.
- The image entrypoint no longer runs `db push` — that remains a **local dev** habit
  (`npm run build` → `prisma db push` is development-only).
- Migrations are idempotent for already-applied migrations. **Never auto-roll back the
  database** when rolling back an image: use expand/contract schema changes and back up
  Postgres before any migration, especially irreversible ones.

## Rollback

Preferred (no rebuild, no server touch):

1. Open Actions → **Run workflow** → branch `main` → `image_tag: sha-<previous-40-hex>`.
2. The pipeline pulls the old immutable image and redeploys.

Manual (same effect, direct on the server):

```bash
cd /var/www/multitenant-smart-and-pro
sed -i 's|^PLATFORM_IMAGE_TAG=.*|PLATFORM_IMAGE_TAG=sha-<previous-40-hex>|' .env
docker compose -f docker-compose.yml -f docker-compose.platform.override.yml pull platform
docker compose -f docker-compose.yml -f docker-compose.platform.override.yml up -d --no-build platform
```

Keep old `sha-<...>` tags in GHCR long enough to roll back. Image rollback and
**schema** rollback are separate operations — see migrations policy.

## Files & local dev boundaries

| File                                   | Role                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `.github/workflows/main.yml`           | The whole pipeline (ci / container / deploy / notify)                      |
| `Dockerfile`                           | Multi-stage Node 20 image (build-time envs are dummy placeholders only)    |
| `docker-entrypoint.sh`                 | Starts the app by default; `exec "$@"` for explicit commands (migrations)  |
| `docker-compose.prod.yml`              | Standalone prod stack (platform + Postgres) — clean hosts / reference only |
| `docker-compose.platform.override.yml` | Image-only override for the integrated VPS stack — used by deploy          |
| `docker-compose.yml`                   | **Development only** (Postgres on 5432)                                    |
| `.dockerignore`                        | Keeps `.env`, secrets and build artifacts out of the image context         |

Local dev is unchanged: `docker compose up -d db`, `npm install`, `npx prisma db push`,
`npm run dev`. Nothing in the pipeline replaces the dev loop.

## Compose files on the server

After the first deploy, `/var/www/multitenant-smart-and-pro/` contains:

- `docker-compose.yml` — the existing integrated stack (untouched, still authoritative)
- `docker-compose.platform.override.yml` — image override, re-uploaded on every deploy
- `docker-compose.platform.yml` — copy of the standalone `docker-compose.prod.yml`,
  uploaded for audit/clean-host reference; **do not `up` it in the integrated stack**
  (it owns ports 5032/5433 and would conflict)

## Troubleshooting

| Symptom                              | Likely cause / fix                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy fails "secret not configured" | Add the missing env secret to the `production` environment                                                                                          |
| `.env must be mode 600`              | `chmod 600 /var/www/multitenant-smart-and-pro/.env`                                                                                                 |
| `service 'platform' not found`       | Server compose uses a different service key — rename it to `platform` or align, then re-run                                                         |
| `docker compose config failed`       | Missing variables in server `.env` (e.g. `PLATFORM_IMAGE_TAG`, `ERP_*`)                                                                             |
| GHCR pull fails on server            | `docker login ghcr.io` PAT expired/insufficient (`read:packages`), or image tag doesn't exist                                                       |
| Health poll timeout                  | Container crashloops — logs are printed by the pipeline; common causes: `DATABASE_URL` still `localhost:5433`, bad `NEXTAUTH_SECRET`, Out-Of-Memory |
| Deploy succeeded but ERP calls fail  | Expected surface: check the ERP health field (`erp.ok`) separately — it does not block deploys                                                      |
| Port 5032/5433 conflict              | Someone started `docker-compose.prod.yml` on the integrated VPS — `docker compose down` that project and rely on the override flow                  |

## Remaining operator work (first deploy)

1. Configure the 4 required + 2 optional GitHub secrets (`production` environment).
2. Run the one-time VPS bootstrap (deploy user, GHCR PAT, `.env` chmod 600, network, service-key check).
3. Trigger the first `workflow_dispatch` from `main` (empty `image_tag`).
4. After green: verify <https://platform.smartapro.com/api/health> shows `db.ok=true`,
   then mark P4.3 deploy pipeline complete in ClickUp.

## Disk space: root cause, prevention & runbook (incident 2026-09-07)

**What happened:** root disk hit 100% → Postgres could not write
(`PostgresError code "53100" ... No space left on device`) → the forgot-password /
transactional-email flow 500'd. This was a **silent** failure: nothing alerted.

**Root causes (in order of size):**

1. **Old `smart-platform` images accumulated** — every deploy pulls a fresh
   ~2.7 GB image (`pull_policy: always`) and nothing ever removed the previous
   ones. 10 images ≈ 27 GB of dead deploy history.
2. **Local `docker build`s left a ~45 GB build cache** on the box.
3. **Unbounded logs** — systemd journal grew to ~3.8 GB; container stdout logs
   had no rotation cap.
4. **No disk monitoring** — first signal was a DB write failure.

**Prevention now built into CI/CD (`.github/workflows/main.yml`, deploy job):**

- **Disk guard (pre-pull):** the deploy aborts with a clear error if the root
  disk is ≥85% full — before pulling a ~2.7 GB image onto a nearly-full disk.
- **Post-deploy image prune:** after a successful deploy + health poll, every
  `ghcr.io/smarterp-multitenant/smart-platform` image **except the currently
  running one** is removed. Safe: all are GHCR tags and re-pullable. A prune
  hiccup never fails the deploy (`|| true`).

**Manual cleanup (run as root on the VPS when disk is tight):**

```bash
# Remove old smart-platform images except the running one:
docker images ghcr.io/smarterp-multitenant/smart-platform -q \
  | grep -vx "$(docker inspect -f '{{.Image}}' erp-platform)" \
  | xargs -r docker rmi
# Drop the (safe) build cache:
docker builder prune -af
# Trim the systemd journal to a bounded size:
journalctl --vacuum-size=200M
# Check what's reclaimable:
docker system df
df -h /
```

**Recommended standing cron (daily):**

```bash
# /usr/local/bin/docker-cleanup.sh — prune dead registry images + old build cache
#!/usr/bin/env bash
docker image prune -f >/dev/null 2>&1
docker builder prune -af --filter until=48h >/dev/null 2>&1
used=$(docker ps -aq | xargs -I{} docker inspect {} -f '{{.Image}}' | sort -u)
for img in $(docker images -q | sort -u); do
  grep -q "^sha256:$img$\|^$img$" <<<"$used" && continue
  repo=$(docker inspect -f '{{index .RepoTags 0}}' "$img" 2>/dev/null)
  [[ "$repo" == *"/"* ]] && docker rmi "$img" >/dev/null 2>&1
done
```

```bash
# crontab -e
0 3 * * * /usr/local/bin/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
```

**Recommended alert (before it's full):**

```bash
# /usr/local/bin/disk-alert.sh — WARN ≥85%, CRITICAL ≥92%. Swap the notifier
# (ntfy shown; Telegram/Slack/n8n all work — n8n already runs on this box).
#!/usr/bin/env bash
pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if   [ "$pct" -ge 92 ]; then MSG="CRITICAL";
elif [ "$pct" -ge 85 ]; then MSG="WARN";
else exit 0; fi
curl -fsS -H "Title: $MSG disk $pct% on $(hostname)" \
  -d "Disk at ${pct}%. Cleanup needed." https://ntfy.sh/your-alerts-topic || true
```

```bash
# crontab -e
*/10 * * * * /usr/local/bin/disk-alert.sh
```

**Log-bounding (one-time, prevents log growth):**

- `/etc/systemd/journald.conf`: set `SystemMaxUse=200M`, then
  `systemctl restart systemd-journald`.
- `/etc/docker/daemon.json`: `{ "log-driver": "json-file",
"log-opts": { "max-size": "10m", "max-file": "3" } }`, then
  `systemctl restart docker` (existing containers pick it up on next recreate).

**Hygiene:**

- `.env.bak.*` and `docker-compose.yml.bak.*` accumulate on the server — keep
  the most recent ~5 and delete the rest periodically.
- Keep an eye on `docker system df` monthly. If the disk trends full again
  (20+ containers with growing DBs), resize the VPS volume — but with the
  prune + guard above, 144 GB should last a long time.

## Secret provisioning & environment matrix (P4.2)

Since 2026-09-07, staging + production **app secrets** are provisioned from
**GitHub environment secrets** (decision D1-A) — the single source for secret
VALUES. The server `.env` holds non-secret configuration (decision D2-C:
hybrid — operator-owned except the CI-rendered secret lines). The authoritative
per-environment variable reference is `docs/env-matrix.md`; keep that file and
this runbook in sync (same-PR rule per AGENTS.md context-sync §2). Ticket:
<https://app.clickup.com/t/86cbbpykx>.

### 1. Where secrets live (per environment)

| Aspect                   | Production                                                                                            | Staging                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GitHub environment       | `production` (Settings → Environments)                                                                | `staging` (decision D3-A — required for closing P4.2)                                                |
| Secret naming            | `ENV_<VAR>` — e.g. `ENV_NEXTAUTH_SECRET`                                                              | same prefix, own values                                                                              |
| Deploy target dir        | `/var/www/multitenant-smart-and-pro` (existing integrated stack)                                      | second compose project on the same VPS — distinct deploy dir, ports and aliases (never the prod dir) |
| Who can edit secrets     | Owner-level only (repo admin / environment admin)                                                     | Owner-level only                                                                                     |
| How values reach the app | Deploy job renders `ENV_*` lines into the server `.env` → `docker compose` `env_file` → container     | Same, via the staging deploy job                                                                     |
| Existing SSH secrets     | `SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY`/`SSH_KNOWN_HOSTS` remain environment secrets exactly as today | (same secrets or dedicated staging host, per D3-A wiring)                                            |

**Ownership notice (m8):** once the render-env step is live (P4.2 workflow PR),
secret lines in the server `.env` are **CI-owned** — manual edits to those lines
are overwritten on the next deploy. This is intended single-source behavior; do
not hand-edit `ENV_*`-sourced lines in the server `.env`. Operator-owned
non-secret values (`PLATFORM_IMAGE_TAG`, `EMAIL_ENABLED`, URLs, ports, feature
flags) stay editable server-side per D2-C.

### 2. Provisioning runbook (production + staging)

Run once per environment, in order:

1. **Create the GitHub environment** (Settings → Environments) and, optionally,
   protection rules (required reviewers / wait timer) for `production`.
2. **Create the `ENV_*` environment secrets** listed below (values never in git):
   - Required at GO/NO-GO: `ENV_NEXTAUTH_SECRET`, `ENV_DATABASE_URL`,
     `ENV_ERP_PLATFORM_API_KEY`, `ENV_ERP_ADMIN_USERNAME`,
     `ENV_ERP_ADMIN_PASSWORD`, `ENV_SMTP_USER`, `ENV_SMTP_PASSWORD`.
   - Conditional (create only when the feature is enabled): `ENV_GITHUB_CLIENT_SECRET`
     / `ENV_GOOGLE_CLIENT_SECRET` (when the matching provider is added to
     `AUTH_PROVIDERS`), `ENV_JACKSON_API_KEY` / `ENV_JACKSON_WEBHOOK_SECRET`
     (when an SSO/SAML backend is deployed), `ENV_SENTRY_AUTH_TOKEN` (when P4.6
     wires source-map upload). Stripe vars stay empty until the Moyasar/Tabby/Tamara
     payments stack lands (D4-A).
   - **RECAPTCHA pair (`ENV_RECAPTCHA_SITE_KEY` + `ENV_RECAPTCHA_SECRET_KEY`):
     REAL keys only, both-or-neither.** `lib/recaptcha.ts:5` activates captcha
     whenever both env values are non-empty — placeholder keys would enable
     captcha with invalid keys and break credentials login. Absent pair is
     rendered by CI as explicit empty values (captcha off, no stale keys).
   - Non-secret SMTP transport config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`) and
     all `FEATURE_*`/behavior flags are **[SRV]** operator-owned per
     `docs/env-matrix.md` — not `ENV_*` secrets.

   Verify each secret name against `docs/env-matrix.md` rows whose source is
   `[GHS]` — that file is canonical; this list must not drift from it.

3. **Bootstrap the target**: compose dir + Docker network + baseline non-secret
   `.env` (mode 600) — mirror the one-time VPS bootstrap steps at the top of
   this document (deploy user, GHCR login, `.env` baseline, network,
   service-key check).
4. **First deploy** (push to `main` or `workflow_dispatch`).
5. **Health check**: `db.ok=true` on the health URL (production:
   `http://127.0.0.1:5032/api/health` via the public endpoint).

**Staging note:** placeholder values are acceptable for external integrations;
`DATABASE_URL` and `NEXTAUTH_URL` necessarily differ per environment. Use the
`docs/env-matrix.md` per-environment "required on boot" checklists as the
definition of a provisioned environment.

### 3. Rotation runbook

- **Per secret, general flow:** generate → replace the value in the GitHub
  environment secret (owner-level) → the next deploy picks it up → verify
  health (`"db":{"ok":true}`) after.
- **`NEXTAUTH_SECRET`:** `openssl rand -base64 32` (≥32 random chars), **unique
  per environment** and different from local dev. Rotation invalidates existing
  sessions — schedule it as a maintenance action.
- **`ERP_PLATFORM_API_KEY` (cross-repo M2M):** MUST be rotated on **both sides in
  the same maintenance window** — the smart-platform environment secret AND the
  ERP `Platform:ApiKey` (`SmartAndPro.ERP.Inventory/SmartAndPro.ERP.WebAPI/appsettings.json:131`,
  env override `Platform__ApiKey`). Coordinate with the ERP lane; verify ERP
  health and kit health after.
- **General rules:** never rotate during peak traffic; always verify health
  after; GitHub environment secrets have **no expiry/versioning** — add a
  **quarterly rotation calendar entry** (Q1..Q4) and rely on the weekly drift
  check (§4) to catch drift.
- **Suspected leak:** rotate immediately, record the incident in ClickUp
  (names + dates only — never the value).

### 4. Drift check (weekly, read-only)

A `workflow_dispatch`-able read-only workflow (added in the P4.2 workflow PR —
see `.github/workflows/main.yml`) verifies:

1. Required `ENV_*` secret **names** exist in each GitHub environment.
2. The server `.env` key-set matches the expected key set in
   `docs/env-matrix.md`.

Names only — it never reads or prints values. It posts a run summary and never
fails a deploy. **When it reports drift:** add the missing secret / reconcile
the server `.env` key set / check `docs/env-matrix.md` is up to date — in that
order.

### 5. Rollback (secret-line related)

If a rendered secret breaks the app, the deploy failure path already prints the
`.env` backup path (`.env.bak.<ts>`). Recovery:

```bash
# 1. On the server — restore the pre-render .env from the printed backup:
cd /var/www/multitenant-smart-and-pro
cp .env.bak.<timestamp> .env && chmod 600 .env
# 2. Redeploy the previous image (from a workstation / GitHub UI):
#    Actions → Run workflow → branch main → image_tag: sha-<previous-40-hex>
# 3. Health poll must return db.ok=true.
```

Retention hygiene: keep the newest ~5 `.env.bak.*` and delete the rest (see the
disk-space section above — the daily cleanup cron already prunes these).

### 6. nginx wildcard + TLS (P4.5 follow-up)

Content documented here by P4.2; the actual config commit is tracked in P4.5:

- **vhost:** server-side `*.smartapro.com` on 443. Config lives in `/etc/nginx/`
  snippets on the VPS; the **decision is to version it in-repo under
  `infra/nginx/`** (to be created in P4.5) so it ships with the app.
- **Wildcard cert:** certbot with DNS-01 (or the documented existing CA flow),
  covering `*.smartapro.com`.
- **Auto-renewal:** systemd timer or cron — `certbot renew --quiet` then reload
  nginx (`systemctl reload nginx` or `nginx -s reload`).
- **Verification:** `certbot certificates` shows expiry; `curl -I` against the
  public host over HTTPS checks the live cert.
- **Troubleshooting:** port 80/443 conflicts with the compose stack's exposed
  ports — the compose services bind their own ports; never bind nginx to a
  compose-allocated port; check `ss -tlnp` for the conflict before reloading.

### 7. Secrets hygiene checklist

- `NEXTAUTH_SECRET`: `openssl rand -base64 32`, unique per environment,
  different from local dev.
- `.env.example` contains no real values (keys/placeholders only).
- gitleaks pre-commit (P4.4) — the tracked tree must stay empty of live values.
- Never paste secret values in ClickUp, commits, or logs — env var **names** and
  `file:line` references only.

Cross-references: `docs/env-matrix.md` (canonical variable matrix) ·
`.agents/context/lookup/env-vars.md` (local mirror, kept in sync per AGENTS.md) ·
`PLAN-P4.2-env-matrix-vault.md` (plan + decision log) · this document's
"GitHub secrets (configure ONCE)" and one-time VPS bootstrap sections above.
