/**
 * POST /api/browser-agent/llm/v1/chat/completions — das Modell des
 * Browser-Dienstes (`services/browser-agent`).
 *
 * browser-use spricht OpenAI Chat Completions (`ChatOpenAI` mit `base_url` auf
 * diesen Präfix). Der Dienst hält keinen Modell-Key: jeder Schritt kommt hier
 * an und geht über die eine Fassade `services/ai/generate.ts` auf die Lane
 * `browser_agent` — samt Failover-Kette und Nutzungszählung.
 *
 * Auth ist ausschliesslich das Run-Token als Bearer
 * (`services/browserAgent/runToken.ts`); keine Sitzung, deshalb auch nicht
 * unter `/api/internal` (dort gilt `requireAdminToken`). Das Token trägt die
 * Person, auf die der Verbrauch gebucht wird.
 *
 * Kein ts-rest-Contract: der Body ist ein fremdes OpenAI-Schema, und der
 * einzige Client ist der Python-Dienst (wie bei `routes/v1/chatCompletionsRouter.ts`).
 */

import { randomUUID } from 'crypto';

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { jsonBody } from '../../middleware/jsonBody.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { aiText } from '../../services/ai/generate.js';
import {
  isBrowserAgentConfigured,
  RUN_TOKEN_TTL_MS,
  verifyRunToken,
} from '../../services/browserAgent/runToken.js';
import { AiProviderError } from '../../services/providers/providerErrors.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { runWithUsageContext } from '../../utils/usageContext.js';

import type { AIRequestData } from '../../services/ai/types.js';

const log = createLogger('browserAgent.llm');

/**
 * Jeder Schritt schickt einen base64-Screenshot, der Verlauf weitere; der
 * globale Parser (10 MB) überspringt diesen Präfix (`bodyParserConfig.ts`).
 */
const BODY_LIMIT = '20mb';

/** browser-use' Standard für `max_completion_tokens`. */
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
/**
 * Unter dem Laufdeckel des Dienstes (170 s) und unter dessen HTTP-Timeout
 * (120 s), damit ein hängender Schritt hier als 502 endet und browser-use
 * selbst entscheiden kann, statt dass der Socket stumm abreisst.
 */
const STEP_TIMEOUT_MS = 75_000;

/**
 * Modellaufrufe je Lauf. Das Token gilt 10 min und liegt in einem fremden
 * Prozess; ohne Deckel könnte, wer es abgreift, bis zum Ablauf beliebig viele
 * Aufrufe auf die Person dahinter buchen. Ein Lauf hat höchstens 25 Schritte
 * mit je einem Aufruf; das Doppelte lässt Luft für Wiederholungen nach
 * ungültigem JSON.
 */
export const MAX_LLM_CALLS_PER_RUN = 50;

/** Zählt den Aufruf; `false`, wenn der Lauf sein Kontingent verbraucht hat. */
async function consumeRunCall(runId: string): Promise<boolean> {
  try {
    // Wie `consumeApiKeyRateLimit`: ein nicht verbundener Client hinge an `incr`.
    if (!redisClient.isReady) {
      log.warn(`[run ${runId}] Redis nicht bereit, Aufruf ungezählt`);
      return true;
    }
    const key = `browser_agent_llm_calls:${runId}`;
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, Math.ceil(RUN_TOKEN_TTL_MS / 1000));
    return count <= MAX_LLM_CALLS_PER_RUN;
  } catch (err) {
    // Fail-open wie die übrigen Zähler: ein Redis-Schluckauf soll keinen Lauf abbrechen.
    log.warn(`[run ${runId}] Redis-Fehler beim Zählen, Aufruf ungezählt:`, err);
    return true;
  }
}

const textPart = z.object({ type: z.literal('text'), text: z.string() }).passthrough();
/**
 * Nur `data:image/…`. Eine entfernte URL würde der SDK-Adapter selbst abrufen
 * (`toImagePart` in `services/ai/execution/adapterUtils.ts`) — von unseren
 * Servern, mit einer URL, die eine besuchte Website in die Seite schreiben kann.
 */
const imagePart = z
  .object({
    type: z.literal('image_url'),
    image_url: z.object({ url: z.string().startsWith('data:image/') }).passthrough(),
  })
  .passthrough();

const message = z.discriminatedUnion('role', [
  z.object({ role: z.literal('system'), content: z.union([z.string(), z.array(textPart)]) }),
  z.object({
    role: z.literal('user'),
    content: z.union([z.string(), z.array(z.union([textPart, imagePart]))]),
  }),
  z.object({
    role: z.literal('assistant'),
    content: z.union([z.string(), z.array(textPart), z.null()]),
  }),
]);

/**
 * Locker bei allem, was wir nicht auswerten (`temperature`, `frequency_penalty`,
 * `seed` …), streng bei den Nachrichten.
 */
const chatCompletionSchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(message).min(1).max(200),
    max_completion_tokens: z.number().int().positive().max(32_000).optional(),
    response_format: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('text') }).passthrough(),
        z.object({ type: z.literal('json_object') }).passthrough(),
        z
          .object({
            type: z.literal('json_schema'),
            json_schema: z
              .object({ name: z.string().optional(), schema: z.record(z.string(), z.unknown()) })
              .passthrough(),
          })
          .passthrough(),
      ])
      .optional(),
  })
  .passthrough();

type ChatCompletionBody = z.infer<typeof chatCompletionSchema>;

interface RunRequest extends TypedRequest<ChatCompletionBody> {
  browserAgentRun?: { runId: string; userId: string };
}

function openAiError(res: Response, status: number, message: string, type: string): void {
  res.status(status).json({ error: { message, type } });
}

function requireRunToken(req: Request, res: Response, next: NextFunction): void {
  if (!isBrowserAgentConfigured()) {
    openAiError(res, 503, 'Browser agent is not configured', 'unavailable');
    return;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const claims = token ? verifyRunToken(token) : null;
  if (!claims) {
    openAiError(res, 401, 'Invalid or expired run token', 'invalid_request_error');
    return;
  }
  (req as RunRequest).browserAgentRun = claims;
  next();
}

async function requireRunBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  const run = (req as RunRequest).browserAgentRun;
  if (!run) return;
  if (!(await consumeRunCall(run.runId))) {
    log.warn(`[run ${run.runId}] Aufrufdeckel (${MAX_LLM_CALLS_PER_RUN}) erreicht`);
    openAiError(res, 429, 'Run call budget exhausted', 'rate_limit_error');
    return;
  }
  next();
}

/**
 * browser-use validiert das JSON selbst mit pydantic; die Fassade kennt nur
 * „JSON ja/nein" (`json: true`). Das Schema geht deshalb als Anweisung vorne
 * in die Nachrichten — die Adapter fassen System-Nachrichten zusammen.
 */
function schemaInstruction(schema: Record<string, unknown>): string {
  return [
    'Antworte ausschliesslich mit einem JSON-Objekt, das genau diesem JSON-Schema entspricht.',
    'Kein Text davor oder danach, keine Markdown-Codeblöcke.',
    '',
    JSON.stringify(schema),
  ].join('\n');
}

const router: Router = Router();

router.post(
  '/v1/chat/completions',
  requireRunToken,
  requireRunBudget,
  // Erst nach dem Token: ein Fremder bringt uns nicht dazu, 20 MB zu parsen.
  jsonBody(BODY_LIMIT),
  validateBody(chatCompletionSchema),
  async (req: Request, res: Response) => {
    const { body, browserAgentRun: run } = req as RunRequest;
    if (!run) return;

    const format = body.response_format;
    const hasResponseFormat = format?.type === 'json_schema' || format?.type === 'json_object';
    const messages: AIRequestData['messages'] = [
      ...(format?.type === 'json_schema'
        ? [{ role: 'system', content: schemaInstruction(format.json_schema.schema) }]
        : []),
      ...body.messages.map((m) => ({ role: m.role, content: m.content ?? '' })),
    ];

    try {
      const content = await runWithUsageContext(
        { req: { user: { id: run.userId } }, feature: 'chat' },
        () =>
          aiText({
            lane: 'browser_agent',
            messages,
            json: hasResponseFormat,
            maxOutputTokens: body.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
            timeoutMs: STEP_TIMEOUT_MS,
          })
      );
      res.json({
        id: `chatcmpl-${randomUUID()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'browser_agent',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        // `aiText` gibt nur den Text zurück; gezählt wird trotzdem, in der
        // Fassade. browser-use liest die Zahlen nur fürs eigene Protokoll.
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    } catch (error: unknown) {
      if (error instanceof AiProviderError) {
        log.warn(`[run ${run.runId}] provider error (${error.code}): ${error.message}`);
        const status = error.code === 'rate_limited' ? 429 : 502;
        openAiError(res, status, `Model provider failed (${error.code})`, 'provider_error');
        return;
      }
      log.error(`[run ${run.runId}] unexpected error`, error);
      openAiError(res, 500, 'Internal error', 'server_error');
    }
  }
);

export default router;
