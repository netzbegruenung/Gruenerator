# Adding a New Landesverband Notebook

> Referenced from `CLAUDE.md`.

All Landesverbände share a single Qdrant collection (`landesverbaende_documents`) and are distinguished by `defaultFilter` on the `landesverband` metadata field. Adding a new one requires touching **9 files** (8 modified + 1 new).

## Naming Conventions

| Concept              | Pattern                        | Example (MV)                      |
| -------------------- | ------------------------------ | --------------------------------- |
| System collection ID | `{name}-system`                | `mecklenburg-vorpommern-system`   |
| Notebook ID          | `{name}-notebook`              | `mecklenburg-vorpommern-notebook` |
| Collection key       | `{name}`                       | `mecklenburg-vorpommern`          |
| Page config key      | `camelCase`                    | `mecklenburgVorpommern`           |
| URL path             | `/gruene-{name}`               | `/gruene-mecklenburg-vorpommern`  |
| Scraper source IDs   | `{name}-lv`, `{name}-fraktion` | `mecklenburg-vorpommern-lv`       |

## Files to Modify

1. **`apps/api/config/systemCollectionsConfig.ts`** — Add `{name}-system` entry to `SYSTEM_COLLECTIONS` with `qdrantCollection: 'landesverbaende_documents'` and `defaultFilter` matching the scraper `shortName` values (e.g., `['MV', 'MV-F']`).

2. **`apps/api/routes/chat/agents/directSearch.ts`** — Add `{name}` entry to `COLLECTION_MAP` pointing to `landesverbaende_documents` and the system ID.

3. **`apps/api/config/notebookCollectionMap.ts`** — Add `{name}-notebook: ['{name}']` to `NOTEBOOK_COLLECTION_MAP`.

4. **`apps/web/src/features/notebook/config/notebooksConfig.js`** — Add gallery card to `PRODUCTION_NOTEBOOKS` with `category: 'landesebene'`.

5. **`apps/web/src/features/notebook/config/notebookPagesConfig.js`** — (a) Add standalone page config with `camelCase` key. (b) Add to the `gruenerator` multi-source `collections` array.

6. **`apps/web/src/config/routes.ts`** — (a) Add lazy component via `createNotebookPage('camelCaseKey')`. (b) Add to `GrueneratorenBundle`. (c) Add route entry `{ path: '/gruene-{name}', ... }`.

7. **`packages/chat/src/lib/mentionables.ts`** — Add to `notebookMentionables` array with a short `mention` alias (e.g., `'mv'`).

8. **`apps/api/scrape-{name}.ts`** (NEW) — Runner script based on `scrape-berlin.ts` template. Sources should match the IDs from `landesverbaendeConfig.ts`.

## Prerequisite: Scraper Config

Before adding the notebook, ensure the scraper config exists in `apps/api/config/landesverbaendeConfig.ts`. The `shortName` field (e.g., `'MV'`, `'MV-F'`) becomes the `defaultFilter` value in the system collection.

## Verification

```bash
pnpm typecheck          # No type errors
pnpm lint               # No lint violations
pnpm build:web          # Frontend builds
# Then manually: visit /gruene-{name}, check /notebook gallery, type @alias in chat
```
