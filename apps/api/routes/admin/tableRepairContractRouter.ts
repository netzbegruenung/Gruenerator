/**
 * Tabellen-Reparatur (`/admin/tabellen`): Quellen finden, deren Tabellen ein
 * neuer Lauf besser lesen würde, und sie neu indexieren. Logik in
 * `services/document-services/tableRepair.ts`.
 */
import { tableRepairContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { reindexDocument } from '../../services/document-services/DocumentProcessingService/reindex.js';
import {
  detectPdfTablePages,
  repairTables,
  scanForTableRepair,
  type TableRepairDeps,
} from '../../services/document-services/tableRepair.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('tableRepairContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

const s = initServer();

function db(): TableRepairDeps['db'] {
  const postgres = getPostgresInstance();
  return {
    query: async <T>(sql: string, params: unknown[]) => (await postgres.query(sql, params)) as T[],
  };
}

export const tableRepairContractRouter = s.router(tableRepairContract, {
  scan: async ({ req, body }) => {
    try {
      const admin = getAuthedUser(req);
      if (!(await requireInstanceAdmin(admin.id, admin.email))) return FORBIDDEN;
      const page = await scanForTableRepair(
        { db: db(), detectTablePages: detectPdfTablePages },
        body.cursor,
        body.limit
      );
      return { status: 200 as const, body: page };
    } catch (error) {
      log.error('scan failed', error);
      return { status: 500 as const, body: { success: false, message: 'Prüfung fehlgeschlagen.' } };
    }
  },

  repair: async ({ req, body }) => {
    try {
      const admin = getAuthedUser(req);
      if (!(await requireInstanceAdmin(admin.id, admin.email))) return FORBIDDEN;
      const results = await repairTables(body.documentIds, {
        db: db(),
        reindex: (documentId, ownerId) => reindexDocument(documentId, ownerId),
      });
      log.info(
        `admin ${admin.id} queued table repair: ${results.filter((r) => r.status === 'queued').length}/${results.length}`
      );
      return { status: 200 as const, body: { results } };
    } catch (error) {
      log.error('repair failed', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Neu indexieren fehlgeschlagen.' },
      };
    }
  },
});

export function mountTableRepairContractRouter(app: Application): void {
  createExpressEndpoints(tableRepairContract, tableRepairContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'tableRepairContract'),
  });
}
