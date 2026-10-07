/**
 * ts-rest router for /api/reisekosten — the Reisekosten-Grünerator.
 *   - extractBeleg:   classify + extract a beleg (from its text, or OCR for scans)
 *   - formular:       blank official form + field map; the browser fills it
 *   - *Abrechnung(en): saved drafts, owner-scoped, trashed into the Papierkorb
 *
 * The browser computes and renders the PDF; bank details, address and phone
 * never arrive here — the contract's `reisekostenServerStateSchema` strips them
 * and the service parses once more before writing.
 *
 * requireAuth is applied at the path prefix in routes.ts, so `req.user` is
 * always present; getUserId() throws only as a safety guard.
 */
import { reisekostenContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  createAbrechnung,
  getAbrechnung,
  listAbrechnungen,
  toAbrechnung,
  trashAbrechnung,
  updateAbrechnung,
} from '../../services/reisekosten/abrechnungService.js';
import { getFormular } from '../../services/reisekosten/formularService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { extractBeleg } from './extractService.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('reisekostenContract');
const s = initServer();

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

const NOT_FOUND = { status: 404 as const, body: { error: 'Abrechnung nicht gefunden.' } };

export const reisekostenContractRouter = s.router(reisekostenContract, {
  extractBeleg: async (args) => {
    try {
      return { status: 200 as const, body: await extractBeleg(args.body) };
    } catch (error) {
      log.error('[reisekosten] extractBeleg failed:', (error as Error).message);
      return { status: 500 as const, body: { error: 'Beleg konnte nicht ausgewertet werden.' } };
    }
  },

  formular: async (args) => {
    const formular = await getFormular(args.params.rateKey);
    if (!formular) {
      return {
        status: 503 as const,
        body: { error: 'Das Formular ist auf diesem Server nicht hinterlegt.' },
      };
    }
    return { status: 200 as const, body: formular };
  },

  listAbrechnungen: async (args) => {
    const rows = await listAbrechnungen(getUserId(args.req));
    return { status: 200 as const, body: { abrechnungen: rows.map(toAbrechnung) } };
  },

  getAbrechnung: async (args) => {
    const row = await getAbrechnung(getUserId(args.req), args.params.idOrSlug);
    return row ? { status: 200 as const, body: toAbrechnung(row) } : NOT_FOUND;
  },

  createAbrechnung: async (args) => {
    const row = await createAbrechnung(getUserId(args.req), args.body.state);
    return { status: 201 as const, body: toAbrechnung(row) };
  },

  updateAbrechnung: async (args) => {
    const row = await updateAbrechnung(getUserId(args.req), args.params.idOrSlug, args.body);
    return row ? { status: 200 as const, body: toAbrechnung(row) } : NOT_FOUND;
  },

  deleteAbrechnung: async (args) => {
    const done = await trashAbrechnung(getUserId(args.req), args.params.idOrSlug);
    return done ? { status: 200 as const, body: { success: true as const } } : NOT_FOUND;
  },
});

export function mountReisekostenContractRouter(app: Application): void {
  createExpressEndpoints(reisekostenContract, reisekostenContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'reisekostenContract'),
  });
}
