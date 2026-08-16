/**
 * ts-rest contract router for POST /api/sharepic/text/<type>.
 *
 * Nine types, one shared core: every handler funnels into `run()`, which
 * calls the Express-free `generateUnifiedTexts` and serializes through
 * `toSharepicTextWireBody` — the same function the legacy Express wrapper and
 * the deprecated `*_claude` aliases use. That shared serializer is what keeps
 * the two transports from drifting apart; `wireBody.vitest.ts` checks its
 * output against the very schemas this contract declares.
 *
 * `text/default` is NOT here (different response shape, different handler) and
 * neither are the `*_claude` aliases (deprecated — contracting them would make
 * them look canonical). Both stay on the Express fallback in routes.ts.
 *
 * Auth and `aiGenerationLimiter` hang on the `/api/sharepic/text` prefix in
 * routes.ts, BEFORE the mount: `createExpressEndpoints` registers onto `app`
 * directly and inherits no later prefix middleware.
 */

import {
  sharepicTextContract,
  type DreizeilenAtTextResponse,
  type DreizeilenTextResponse,
  type InfoAtTextResponse,
  type InfoTextResponse,
  type SharepicTextBody,
  type SimpleTextResponse,
  type SliderTextResponse,
  type VeranstaltungTextResponse,
  type ZitatTextResponse,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { createLogger } from '../../../utils/logger.js';

import { analyzeSlideCount } from './sliderSmartHandler.js';
import {
  generateUnifiedTexts,
  toSharepicTextWireBody,
  type UnifiedTextBody,
} from './unifiedHandler.js';

import type { SharepicRequest } from './types.js';
import type { Application, Request } from 'express';

const log = createLogger('sharepicTextContract');

const s = initServer();

/**
 * Upper bound for `count`. Clamped rather than rejected: web sends 1, mobile a
 * fixed 5, the smart slider 3–5. A value that the endpoint accepted yesterday
 * must not become a 400 today.
 */
const MAX_COUNT = 20;

function clampCount(count: number | null | undefined): number {
  if (typeof count !== 'number' || !Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.trunc(count), 1), MAX_COUNT);
}

/**
 * Builds the handler body FIELD BY FIELD instead of spreading `args.body`.
 *
 * That is deliberate. `generateUnifiedTexts` ALSO branches on `userLocale` into
 * the `<type>_at` prompts — a second door to the same Austrian sujets that the
 * `info_at`/`dreizeilen_at` routes reach through `type`. Two doors, one shape
 * per route: the routes pass the AT type explicitly and never a locale, so
 * `POST …/info` cannot answer with Austrian fields no matter what the caller
 * sends. Same for `_campaignPrompt`, which would let a caller swap the system
 * prompt.
 */
function toUnifiedBody(body: SharepicTextBody): UnifiedTextBody {
  return {
    thema: body.thema ?? undefined,
    details: body.details ?? undefined,
    quote: body.quote ?? undefined,
    name: body.name ?? undefined,
    partyName: body.partyName ?? undefined,
    count: clampCount(body.count),
  };
}

type RunResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: 400 | 500; body: { success: false; error: string } };

async function run(req: Request, type: string, body: SharepicTextBody): Promise<RunResult> {
  const result = await generateUnifiedTexts(type, toUnifiedBody(body));

  if (!result.success) {
    log.warn(`[${type}] ${result.status}: ${result.error}`);
    return { status: result.status, body: { success: false, error: result.error } };
  }

  return {
    status: 200,
    body: toSharepicTextWireBody(result, type, body.name ?? ''),
  };
}

export const sharepicTextContractRouter = s.router(sharepicTextContract, {
  generateDreizeilen: async (args) => {
    const r = await run(args.req, 'dreizeilen', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as DreizeilenTextResponse }
      : { status: r.status, body: r.body };
  },

  generateZitat: async (args) => {
    const r = await run(args.req, 'zitat', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as ZitatTextResponse }
      : { status: r.status, body: r.body };
  },

  generateZitatPure: async (args) => {
    const r = await run(args.req, 'zitat_pure', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as ZitatTextResponse }
      : { status: r.status, body: r.body };
  },

  generateInfo: async (args) => {
    const r = await run(args.req, 'info', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as InfoTextResponse }
      : { status: r.status, body: r.body };
  },

  generateVeranstaltung: async (args) => {
    const r = await run(args.req, 'veranstaltung', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as VeranstaltungTextResponse }
      : { status: r.status, body: r.body };
  },

  generateSimple: async (args) => {
    const r = await run(args.req, 'simple', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as SimpleTextResponse }
      : { status: r.status, body: r.body };
  },

  // Die AT-Routen reichen den `_at`-Typ an denselben Kern weiter. Der Handler
  // schlägt Prompt UND Feldliste unter diesem Schlüssel nach — es braucht also
  // keinen Locale-Parameter, damit die österreichischen Felder herauskommen.
  generateDreizeilenAt: async (args) => {
    const r = await run(args.req, 'dreizeilen_at', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as DreizeilenAtTextResponse }
      : { status: r.status, body: r.body };
  },

  generateInfoAt: async (args) => {
    const r = await run(args.req, 'info_at', args.body);
    return r.status === 200
      ? { status: 200 as const, body: r.body as InfoAtTextResponse }
      : { status: r.status, body: r.body };
  },

  generateSlider: async (args) => {
    const body = args.body;

    // `handleSliderSmartRequest` writes into `res`, so it is unusable here.
    // `analyzeSlideCount` is the reusable half: it picks 1–3 content slides,
    // and cover + last bring the deck to 3–5.
    const count = body.smartCount
      ? (await analyzeSlideCount(
          args.req as SharepicRequest,
          body.thema ?? '',
          body.details ?? ''
        )) + 2
      : clampCount(body.count);

    const r = await run(args.req, 'slider', { ...body, count });
    return r.status === 200
      ? { status: 200 as const, body: r.body as SliderTextResponse }
      : { status: r.status, body: r.body };
  },
});

/**
 * Mount onto the Express app. Call from routes.ts AFTER the prefix middleware
 * (`app.use('/api/sharepic/text', aiGenerationLimiter, requireAuth)`) and
 * BEFORE `app.use('/api/sharepic', …, promptRoute)`.
 */
export function mountSharepicTextContractRouter(app: Application): void {
  createExpressEndpoints(sharepicTextContract, sharepicTextContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharepicTextContract'),
  });
}
