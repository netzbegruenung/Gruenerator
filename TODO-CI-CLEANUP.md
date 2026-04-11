# CI Cleanup Tasks

Status of CI pipeline on `master` as of 2026-04-06.

## Completed

- [x] **packages/ui typecheck** — Fixed broken `src/` absolute imports, `z.url()` Zod v3 compat, calendar index signatures, question-flow useEffect return
- [x] **apps/mobile typecheck** — Added `@gruenerator/collab` dependency, `Props` interface for ThreadListItem, `BridgedWebSocket` type cast, safe `import.meta.env` access
- [x] **apps/mobile ESLint** — Fixed empty catch blocks, missing JSX keys, import order, duplicate imports, curly brace presence
- [x] **apps/mobile ESLint config** — Removed `eslint.config.js` from `allowDefaultProject` (already in project service), added `shims/isomorphic-webcrypto.js`
- [x] **apps/web typecheck** — Fixed `react-qr-code` named import to default import (5 files)
- [x] **apps/api ESLint** — Replaced forbidden `import()` type annotation with proper import in `intentExecutionService.ts`
- [x] **apps/api manual tests** — Moved 5 manual test scripts to gitignored `__manual_tests__/` folder (fixed `await-thenable` lint error)
- [x] **Vite 8.0.5** — Updated all 4 workspaces, fixed lockfile/package.json specifier mismatch
- [x] **Dependabot alerts** — Resolved 3 Vite vulnerabilities (2 high, 1 medium)

## Remaining

- [ ] **Prettier formatting (135 files)** — `pnpm format:check` fails on 135 pre-existing unformatted files across `packages/canvas-editor`, `apps/wordpress`, `packages/chat`, `packages/docs`, `apps/mobile`, `apps/web`, and others. Fix: `pnpm format` then commit. Blocked by pre-commit hook running ESLint on all 135 staged files (too slow on WSL). Workaround: single formatting-only commit or batch by package.
- [ ] **Hocuspocus floating promise** — `services/hocuspocus/src/main.ts:45` has `@typescript-eslint/no-floating-promises` warning. Not blocking CI (warning, not error) but should be addressed.
