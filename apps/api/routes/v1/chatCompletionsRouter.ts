/**
 * POST /api/v1/chat/completions — OpenAI-compatible model access for headless
 * clients that bring their own agent loop (currently the Grünerator Excel
 * add-in).
 *
 * No ChatGraph, no tools, no intent classification, no notebooks: this is model
 * access and nothing else. It exists because the nginx in front of verdigado
 * answers the CORS preflight with 401 (a browser sends `OPTIONS` without
 * credentials by spec), which makes LiteLLM unreachable from a taskpane without
 * a local proxy. Here `cors()` runs as the very first middleware in
 * `server.ts`, so the preflight is answered before `requireApiKey` is reached.
 *
 * No ts-rest contract on purpose: the body is a foreign OpenAI schema we do not
 * own and the response is a byte stream — the contract layer is for endpoints
 * our own typed frontend consumes via `getContractsClient()`.
 */

import { once } from 'node:events';

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { assertScope } from '../../middleware/apiKeyMiddleware.js';
import { apiKeyRateLimit } from '../../middleware/apiKeyRateLimitMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import {
  forwardChatCompletion,
  estimatePromptTokens,
  resolveRequestedModel,
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  MODEL_LABELS,
  MAX_PROMPT_TOKENS,
} from '../../services/ai/addinModelPassthrough.js';
import { createLogger } from '../../utils/logger.js';

import { requireAddinAuth } from './addinAuth.js';

const log = createLogger('v1.chatCompletions');

const router: Router = Router();

router.use(requireAddinAuth);
router.use(apiKeyRateLimit('chat-completions'));

const REQUIRED_SCOPE = 'chat:completions';

/**
 * Only the fields we act on are typed; everything else passes through verbatim
 * so parameters we do not model (tool_choice, response_format, …) still reach
 * the upstream.
 */
const chatCompletionSchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(z.object({ role: z.string() }).passthrough()).min(1, 'messages is required'),
    stream: z.boolean().optional(),
  })
  .passthrough();

type ChatCompletionBody = z.infer<typeof chatCompletionSchema>;

router.post(
  '/',
  validateBody(chatCompletionSchema),
  async (req: TypedRequest<ChatCompletionBody>, res: Response) => {
    const ctx = req.apiKey;
    if (!ctx) {
      res.status(401).json({ error: 'API key context missing' });
      return;
    }
    if (!assertScope(ctx, REQUIRED_SCOPE)) {
      res.status(403).json({ error: `API key lacks the '${REQUIRED_SCOPE}' scope` });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const requested = typeof body.model === 'string' ? body.model : DEFAULT_MODEL;
    // Legacy-Kennungen werden umgeschrieben, nicht abgelehnt: ein installiertes
    // Add-in hat die Modellliste gecacht — siehe `resolveRequestedModel`.
    const model = resolveRequestedModel(requested);
    if (!model) {
      res.status(400).json({
        error: `Model '${requested}' is not available on this endpoint`,
        allowedModels: [...ALLOWED_MODELS],
      });
      return;
    }
    if (model !== requested) body.model = model;

    const estimatedTokens = estimatePromptTokens(body);
    if (estimatedTokens > MAX_PROMPT_TOKENS) {
      // The upstream would accept this and answer over a truncated prompt with
      // HTTP 200 — a wrong answer that looks like a correct one. A 400 is the
      // only outcome the caller can act on.
      res.status(400).json({
        error: 'Request exceeds the model context window',
        estimatedTokens,
        maxTokens: MAX_PROMPT_TOKENS,
      });
      return;
    }

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    const result = await forwardChatCompletion({ ...body, model }, controller.signal);
    if (!result.ok) {
      if (result.status === 499) return; // client went away; nothing to answer
      log.warn(`[v1.chatCompletions] upstream ${result.status}: ${result.error}`);
      res.status(result.status).json({ error: result.error });
      return;
    }

    if (body.stream !== true) {
      // `unknown`, nicht der `any` aus `Response.json()`: der Rumpf ist ein
      // fremdes OpenAI-Schema, das wir bewusst unveraendert durchreichen. Ein
      // `any` waere hier kein Wissen, sondern ein abgeschalteter Typ — und er
      // pflanzt sich in jede Zeile fort, die ihn anfasst.
      const data: unknown = await result.response.json().catch(() => null);
      if (data === null) {
        res.status(502).json({ error: 'Upstream returned a malformed response' });
        return;
      }
      res.json(data);
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Without this nginx buffers the whole stream and the client sees nothing
    // until the answer is complete.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader = result.response.body!.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (res.writableEnded) break;
        if (!res.write(Buffer.from(value))) await once(res, 'drain');
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        log.warn('[v1.chatCompletions] stream aborted:', err);
      }
    } finally {
      reader.releaseLock();
      if (!res.writableEnded) res.end();
    }
  }
);

export default router;

/**
 * GET /api/v1/models — OpenAI-compatible model discovery.
 *
 * OpenAI-compatible clients probe `${baseUrl}/models` to learn what they may
 * ask for, and they cache the answer. Without this route a client keeps
 * whatever it discovered against an earlier base URL — which is how a stale
 * `gemma` (picked up from the upstream's own list) ends up being sent here.
 * Serving the allowlist is what lets that self-correct; bis es so weit ist,
 * schreibt `resolveRequestedModel` die alten Kennungen um.
 */
export const modelsRouter: Router = Router();

modelsRouter.use(requireAddinAuth);
modelsRouter.use(apiKeyRateLimit('chat-completions'));

modelsRouter.get('/', (req: Request, res: Response) => {
  const ctx = req.apiKey;
  if (!ctx || !assertScope(ctx, REQUIRED_SCOPE)) {
    res.status(403).json({ error: `API key lacks the '${REQUIRED_SCOPE}' scope` });
    return;
  }

  res.json({
    object: 'list',
    data: ALLOWED_MODELS.map((id) => ({
      id,
      object: 'model',
      owned_by: 'gruenerator',
      // Nicht Teil der OpenAI-Spezifikation, aber von Clients als Anzeigename
      // gelesen — sonst steht in der Auswahl nur die technische Kennung.
      name: MODEL_LABELS[id],
    })),
  });
});
