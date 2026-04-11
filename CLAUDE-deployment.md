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
2. Build images run on push, or manual: `gh workflow run "Build and Push Docker Images" --ref test-branch`
3. Deploy runs on push, or manual: `gh workflow run "Deploy to Test Environment" --ref test-branch`
4. Always force-recreates containers (`--force-recreate`)

## Production

- **Workflow**: "Deploy to Production" (`deploy-prod.yml`), **Branch**: `master`

## Docs Expo (Android APK)

See `CLAUDE-expo.md` for build, install, and debug instructions.
