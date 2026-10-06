/**
 * ts-rest contract for reporting objectionable content.
 *
 * POST /api/content-reports → emails the report to the operator. Auth-protected
 * (requireAuth at prefix in routes.ts) so the report is attributed to the user.
 */
import { initContract } from '@ts-rest/core';

import {
  contentReportCreateSchema,
  contentReportErrorSchema,
  contentReportResponseSchema,
} from '../schemas/contentReport.js';

const c = initContract();

export const contentReportContract = c.router(
  {
    create: {
      method: 'POST',
      path: '/api/content-reports',
      body: contentReportCreateSchema,
      responses: {
        200: contentReportResponseSchema,
        400: contentReportErrorSchema,
        500: contentReportErrorSchema,
      },
      summary: 'Inhalt (Beitrag, Kommentar, KI-Antwort) melden',
    },
  },
  { pathPrefix: '' }
);
