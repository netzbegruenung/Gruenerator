/**
 * ts-rest-Router der Ordneransicht verbundener Konten (OneDrive, Google Drive).
 *
 * `requireAuth` sitzt am Präfix `/api/connections` (routes.ts). Gelesen wird
 * nur mit dem Token der angemeldeten Person; Inhalte holt erst der Chat-Abruf
 * beim Senden (`connectRetrieval.ts`), diese Route liefert nur die Liste.
 */
import { connectionsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import axios from 'axios';

import { ConnectionService } from '../../services/connections/ConnectionService.js';
import { browseDrive } from '../../services/connections/driveBrowse.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('connectionsContractRouter');

const s = initServer();

function failure<S extends 401 | 404 | 500>(status: S, message: string, reauth = false) {
  return { status, body: { success: false as const, message, reauth } };
}

export const connectionsContractRouter = s.router(connectionsContract, {
  browse: async ({ req, params, query }) => {
    const userId = getAuthedUser(req).id;

    let accessToken: string;
    try {
      ({ accessToken } = await ConnectionService.getConnection(userId, params.provider));
    } catch (err) {
      log.warn(`[browse] ${params.provider} connection lookup failed`, err);
      return failure(401, 'Konto nicht verbunden oder Zugang abgelaufen.', true);
    }

    try {
      const folder = await browseDrive(params.provider, accessToken, query.folderId);
      return { status: 200 as const, body: { success: true as const, ...folder } };
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        return failure(401, 'Zugang abgelaufen — bitte neu verbinden.', true);
      }
      if (status === 404 || (err instanceof Error && err.message.startsWith('Invalid'))) {
        return failure(404, 'Ordner nicht gefunden.');
      }
      log.error(`[browse] ${params.provider} listing failed`, err);
      return failure(500, 'Ordner konnte nicht geladen werden.');
    }
  },
});

export function mountConnectionsContractRouter(app: Application): void {
  createExpressEndpoints(connectionsContract, connectionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'connectionsContract'),
  });
}
