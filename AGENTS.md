# Repository Guidelines

## Project Structure & Module Organization
- Backend (`gruenerator_backend`): Express server (`server.mjs`), route handlers (`routes/`, `routes.js`), middleware (`middleware/`), utilities (`utils/`), workers (`workers/`), SQL schemas/migrations (`sql/`), public uploads (`uploads/`).
- Frontend (`gruenerator_frontend`): React + Vite app (`src/`), static assets (`public/`), bundle config (`vite.config.js`).
- Other: AWS helper artifacts in `aws/`, repository docs in root.

## Build, Test, and Development Commands
- Backend dev: `cd gruenerator_backend && npm install && npm run start:dev` (starts API + Yjs on port 3001/1234).
- Backend prod: `npm run start:prod` (same directory; production mode).
- Backend tests: `npm test`, `npm run test:watch`, or targeted (e.g., `npm run test:integration`).
- Frontend dev: `cd gruenerator_frontend && npm install && npm start` (Vite dev server).
- Frontend build/preview: `npm run build` then `npm run preview`.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; keep lines focused and readable.
- JavaScript modules: camelCase for variables/functions, PascalCase for React components and classes.
- File naming: backend utilities under `utils/*.js(mjs)`; React components under `src/components/*/*.jsx`.
- Linting: Frontend uses ESLint (see `package.json`). Fix warnings before opening a PR.

## Testing Guidelines
- Backend: Jest configured in `gruenerator_backend` (matches `**/*.test.js`). Place unit tests near code or in `test/`.
- Frontend: Jest + React Testing Library available; write component tests for UI logic.
- Run all tests locally before pushing: `npm test` in each package.

## Commit & Pull Request Guidelines
- Commits: short, imperative subject lines (e.g., `Fix upload race`, `Refactor auth flow`). Group related changes; avoid noisy commits.
- PRs: include a clear description, linked issues, reproduction steps, and for UI changes add screenshots or short clips. Note any migrations in `gruenerator_backend/sql` and rollout steps.

## Security & Configuration Tips
- Secrets via environment variables (`.env`) only; never commit keys. Relevant areas: Keycloak/OIDC (`config/*.mjs`), Redis, Postgres, external AI providers.
- Validate inputs at the API boundary (`middleware/`, `utils/inputValidation.js`) and prefer existing helpers.

## Architecture Overview (Brief)
- SPA frontend talks to the Node/Express backend; background tasks handled by worker pool (`workers/`). Real‑time collaboration via Yjs websocket server.
