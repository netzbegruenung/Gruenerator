# CLAUDE-deployment.md

Deployment, Docker, and environment configuration.

## Test Environment

- **URL**: https://beta.gruenerator.eu
- **Server**: gruenerator-test.netzbegruenung.verdigado.net
- **Branch**: `test-branch`

## Docker Images

- **Workflow**: "Build and Push Docker Images" (`build-images.yml`)
  - Triggers on push to `master` or `test-branch` (when app/service files change)
  - Manual dispatch with `force_all: true` to rebuild everything
  - Individual services: `build_web`, `build_api`, `build_docs`, `build_mcp`, `build_doku`
  - Registry: `ghcr.io/netzbegruenung/gruenerator-{web,api,docs,mcp,doku}`

### Adding a New Shared Package (Docker Checklist)

Three files must be updated or Docker builds fail:

1. **Every Dockerfile that transitively depends on it** — add `COPY packages/<name>/package.json` and `COPY packages/<name>`. Check deps: `pnpm --filter <app> list --depth 1 --json | grep @gruenerator`.
2. **`.github/workflows/build-images.yml`** — add `'packages/<name>/**'` to `dorny/paths-filter`.
3. **`.gitignore`** — verify path not matched by broad pattern (e.g. `docs/` matches `*/docs/`; use `/docs/`).

### `packages/shared` Runtime `.ts` Trap

`packages/shared` exports raw `.ts` (no build in dev). Node.js cannot import `.ts` at runtime. Docker services not bundled by Vite have two options:

1. **Inline** (preferred for small utils) — copy function into service. Avoids shared's transitive deps.
2. **Build + rewrite** (heavy usage) — build shared in Docker, copy `dist/`, `sed`-rewrite exports `.ts` → `.js`. See `apps/api/Dockerfile`.

## Deploying to Test

1. Merge into `test-branch` (via PR from `master`)
2. Build images run on push (filtered by changed paths) or manual: `gh workflow run "Build and Push Docker Images" --ref test-branch -f build_web=true` (or `-f force_all=true`)
3. Image rollout to `gruenerator-test.netzbegruenung.verdigado.net` happens **out of band** — there is no `Deploy to Test Environment` workflow in this repo. The test server pulls fresh images via its own mechanism (Watchtower/poller). To force-redeploy: SSH in and `docker pull ghcr.io/netzbegruenung/gruenerator-web:test-branch && docker compose up -d --force-recreate <service>`.

### Verifying a deploy landed

Compare the asset hash in `https://beta.gruenerator.eu/index.html` against the local `pnpm --filter @gruenerator/web build` output (`apps/web/build/assets/js/`). If the served `<script src>` hash matches, the rollout is in.

### Path filter gotcha

A push that touches **only** `.github/**` or files outside the `web:` filter list in `build-images.yml` will be reported `success` with `build-web: skipped`. Silence ≠ deploy. To force a rebuild, dispatch the workflow with `-f build_web=true`.

## Production

Production deployment is owned outside this repo (no `deploy-prod.yml` here). Coordinate with infrastructure when promoting `master`.

### System MCP sources (bahn/reise/wetter/news chat intents)

The Deutsche-Bahn / Open-Meteo / ARD-Tagesschau / trivago chat sources are env-gated: set `SYSTEM_MCP_DB_URL`, `SYSTEM_MCP_WEATHER_URL`, `SYSTEM_MCP_ARD_URL`, `SYSTEM_MCP_TRIVAGO_URL` (+ optional `…_TOKEN` for shared bearer auth) in the API's deploy env to activate them. The `reise` umbrella intent mounts bahn + hotel + wetter together. Unset URL = intent degrades gracefully (web/direct fallback). The first-party endpoints live only in deploy env — never commit them; users never see them (trivago's hosted URL is public: `https://mcp.trivago.com/mcp`).

## Docs Expo (Android APK)

See `CLAUDE-expo.md` for build, install, and debug instructions.
