# CLAUDE-routing.md

Express 5 route typing, AI client access, and locale-aware backend code.

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

## Zugriff auf das Modell

Eine Tür: `services/ai/generate.ts`. Kein Client im Request, kein
`app.locals.aiClient` — beides ist seit dem 16.08.2026 weg (Welle 3 der
Fassaden-Migration).

```typescript
import { aiText } from '../../services/ai/generate.js';

const antwort = await aiText({ lane: 'rede', system, prompt, temperature: 0.4 });
```

`aiText` liefert einen String und **wirft**, wenn kein Provider der Kette
geantwortet hat (`NoAnswerError`, ein `AiProviderError` mit `code`/`retryable`).
Für strukturierte Werte `aiObject`, für echtes Tool-Calling `aiTools`.

Zwei Fallen beim Umzug einer alten Aufrufstelle:

- Ein `type` **ohne** Zeile in `AI_LANES` landet auf `default` und wird als
  Versehen protokolliert. Wer bewusst woanders hin will, nimmt `AiCall.pinned`
  (ein Stufenname aus `intermediateLanes.ts` oder ein Provider/Modell-Paar).
- `response_format: {type:'json_object'}` heisst auf der Fassade `json: true`.
  Weglassen macht erzwungenes JSON still wieder zu einer Prompt-Bitte.

## Locale-Aware Backend Code

Platform serves German (`de-DE`) and Austrian (`de-AT`) users. Never hardcode party names or collection lists.

1. **Party name**: Use `{{partyName}}` in prompts — replaced by `localizePlaceholders()`. Also: `{{partyNameShort}}`, `{{partyNameGenitive}}`.
2. **Qdrant collections**: Filter by locale. Austrian: `oesterreich_gruene_documents`, `gruene_at_documents`. German: `grundsatz_documents`, `bundestag_content`, `kommunalwiki_documents`, `gruene_de_documents`.
3. **Web search**: Never hardcode party name. Use locale-aware name or omit.
4. **`enrichRequest(body, options, req)`**: `req` must be 3rd argument (not inside options).
5. **Ein direkter `aiText`-Aufruf**: Bypasses localization. Prefer `assemblePromptGraphAsync` or call `localizePlaceholders()` manually.

Utilities in `services/localization/index.ts`: `extractLocaleFromRequest(req)`, `localizePlaceholders(text, locale)`, `getDefaultCollectionsForLocale(locale)`.
