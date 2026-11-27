/**
 * ts-rest-Vertrag der Tabellen-Reparatur. Unter `/api/auth/admin/…`: `requireAuth`
 * greift am Präfix, die Admin-Rolle prüft jeder Handler mit `requireInstanceAdmin`.
 */
import { initContract } from '@ts-rest/core';

import {
  tableRepairErrorSchema,
  tableRepairRepairBodySchema,
  tableRepairRepairResponseSchema,
  tableRepairScanBodySchema,
  tableRepairScanResponseSchema,
} from '../schemas/tableRepair.js';

const c = initContract();

export const tableRepairContract = c.router(
  {
    /** POST /api/auth/admin/table-repair/scan — eine Seite Quellen prüfen. */
    scan: {
      method: 'POST',
      path: '/api/auth/admin/table-repair/scan',
      body: tableRepairScanBodySchema,
      responses: {
        200: tableRepairScanResponseSchema,
        401: tableRepairErrorSchema,
        403: tableRepairErrorSchema,
        500: tableRepairErrorSchema,
      },
      summary: 'Quellen auf reparierbare Tabellen prüfen (Admin)',
    },

    /** POST /api/auth/admin/table-repair/repair — Quellen neu indexieren. */
    repair: {
      method: 'POST',
      path: '/api/auth/admin/table-repair/repair',
      body: tableRepairRepairBodySchema,
      responses: {
        200: tableRepairRepairResponseSchema,
        401: tableRepairErrorSchema,
        403: tableRepairErrorSchema,
        500: tableRepairErrorSchema,
      },
      summary: 'Quellen mit reparierbaren Tabellen neu indexieren (Admin)',
    },
  },
  { pathPrefix: '' }
);
