/**
 * ts-rest router for the Grünerator-Marktplatz.
 *
 * requireAuth and the rate limiters are applied at the /api/marketplace prefix
 * in routes.ts. Liking and saving check that the caller may see the item;
 * removing a like or a save does not, so stale ones stay removable.
 */
import { marketplaceContract, type MarketplacePlatform } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { buildMarketplaceContext } from '../../services/marketplace/context.js';
import {
  getMarketplaceItem,
  listMarketplace,
  setLike,
  setSaved,
} from '../../services/marketplace/marketplaceService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { RequestWithLocale } from '../../services/localization/types.js';
import type { Application } from 'express';

const log = createLogger('marketplaceContractRouter');

const NOT_FOUND = {
  status: 404 as const,
  body: { success: false as const, message: 'Element nicht gefunden.' },
};

const LIBRARY_FULL = {
  status: 409 as const,
  body: {
    success: false as const,
    message: '„Meine Grüneratoren" ist voll. Entferne zuerst etwas, das du nicht mehr brauchst.',
  },
};

const serverError = (message: string) => ({
  status: 500 as const,
  body: { success: false as const, message },
});

function contextFor(
  user: { userId: string; locale: string | null },
  platform: MarketplacePlatform = 'web'
) {
  return buildMarketplaceContext({ ...user, platform });
}

const viewer = (req: RequestWithLocale & { user?: unknown }) => ({
  userId: getAuthedUser(req).id,
  locale: extractLocaleFromRequest(req),
});

const s = initServer();

export const marketplaceContractRouter = s.router(marketplaceContract, {
  list: async ({ req, query }) => {
    try {
      const body = await listMarketplace(contextFor(viewer(req), query.platform), query);
      return { status: 200 as const, body };
    } catch (error) {
      log.error('[marketplaceContract.list] Error:', error);
      return serverError('Fehler beim Laden des Marktplatzes.');
    }
  },

  get: async ({ req, params, query }) => {
    try {
      const item = await getMarketplaceItem(
        contextFor(viewer(req), query.platform),
        params.kind,
        params.ref
      );
      if (!item) return NOT_FOUND;
      return { status: 200 as const, body: { item } };
    } catch (error) {
      log.error('[marketplaceContract.get] Error:', error);
      return serverError('Fehler beim Laden des Eintrags.');
    }
  },

  like: async ({ req, params }) => {
    try {
      const result = await setLike(contextFor(viewer(req)), params.kind, params.ref, true);
      if (!result.ok) return NOT_FOUND;
      return { status: 200 as const, body: result.value };
    } catch (error) {
      log.error('[marketplaceContract.like] Error:', error);
      return serverError('Like fehlgeschlagen.');
    }
  },

  unlike: async ({ req, params }) => {
    try {
      const result = await setLike(contextFor(viewer(req)), params.kind, params.ref, false);
      if (!result.ok) return serverError('Like entfernen fehlgeschlagen.');
      return { status: 200 as const, body: result.value };
    } catch (error) {
      log.error('[marketplaceContract.unlike] Error:', error);
      return serverError('Like entfernen fehlgeschlagen.');
    }
  },

  save: async ({ req, params }) => {
    try {
      const result = await setSaved(contextFor(viewer(req)), params.kind, params.ref, true);
      if (!result.ok) return result.status === 409 ? LIBRARY_FULL : NOT_FOUND;
      return { status: 200 as const, body: result.value };
    } catch (error) {
      log.error('[marketplaceContract.save] Error:', error);
      return serverError('Speichern fehlgeschlagen.');
    }
  },

  unsave: async ({ req, params }) => {
    try {
      const result = await setSaved(contextFor(viewer(req)), params.kind, params.ref, false);
      if (!result.ok) return serverError('Entfernen fehlgeschlagen.');
      return { status: 200 as const, body: result.value };
    } catch (error) {
      log.error('[marketplaceContract.unsave] Error:', error);
      return serverError('Entfernen fehlgeschlagen.');
    }
  },
});

export function mountMarketplaceContractRouter(app: Application): void {
  createExpressEndpoints(marketplaceContract, marketplaceContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'marketplaceContract'),
  });
}
