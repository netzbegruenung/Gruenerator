# CLAUDE-routing.md

Express 5 route typing, AI worker pool access, and locale-aware backend code.

## Express 5 Route Typing

Express 5 changed `req.params` from `string` to `string | string[]`. Declare params explicitly.

**POST/PUT/PATCH with `validateBody`:**

```typescript
import { z } from 'zod';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';

const mySchema = z.object({ title: z.string(), draft: z.boolean().optional() });

router.post('/:id', validateBody(mySchema), async (req: TypedRequest<z.infer<typeof mySchema>, { id: string }>, res: Response): Promise<void> => {
  const { title, draft } = req.body;  // typed by Zod
  const { id } = req.params;          // typed by generic P
  req.user?.id;                        // available (TypedRequest includes user)
});
```

> **NEVER intersect `TypedRequest` with `& AuthenticatedRequest` or `& Request`.** Express `body: any` absorbs typed body. `TypedRequest<T, P>` already includes `user?`, `mobileAuth?`, `jwtToken?`, `sessionID?`.

**GET/DELETE (no body):**

```typescript
router.get('/:id', async (req: AuthRequest<{ id: string }>, res: Response) => {
  const { id } = req.params; // correctly typed as string
});
```

Custom request types (`AuthRequest`, `AuthenticatedRequest`) accept optional params generic `P`. For complex params, use `getParam()` from `utils/params.js`.

## AI Worker Pool Access

Always use typed helper — never `req.app.locals.aiWorkerPool` (it's `any`):

```typescript
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
const aiWorkerPool = getAIWorkerPool(req);
```

Import type from canonical interface only:
```typescript
import { type AIWorkerPool } from '../../workers/types.js';  // correct
// NOT from '../../workers/aiWorkerPool.js' — that imports the class
```

## Locale-Aware Backend Code

Platform serves German (`de-DE`) and Austrian (`de-AT`) users. Never hardcode party names or collection lists.

1. **Party name**: Use `{{partyName}}` in prompts — replaced by `localizePlaceholders()`. Also: `{{partyNameShort}}`, `{{partyNameGenitive}}`.
2. **Qdrant collections**: Filter by locale. Austrian: `oesterreich_gruene_documents`, `gruene_at_documents`. German: `grundsatz_documents`, `bundestag_content`, `kommunalwiki_documents`, `gruene_de_documents`.
3. **Web search**: Never hardcode party name. Use locale-aware name or omit.
4. **`enrichRequest(body, options, req)`**: `req` must be 3rd argument (not inside options).
5. **Direct `aiWorkerPool.processRequest`**: Bypasses localization. Prefer `assemblePromptGraphAsync` or call `localizePlaceholders()` manually.

Utilities in `services/localization/index.ts`: `extractLocaleFromRequest(req)`, `localizePlaceholders(text, locale)`, `getDefaultCollectionsForLocale(locale)`.
