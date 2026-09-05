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
