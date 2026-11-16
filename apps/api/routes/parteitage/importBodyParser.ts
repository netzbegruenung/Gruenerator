import express, { type RequestHandler } from 'express';

import { requireInstanceAdminMiddleware } from '../../middleware/requireInstanceAdminMiddleware.js';

export const PARTEITAGE_IMPORT_PATH = '/api/admin/parteitage/import';

/**
 * The import manifest holds every speech's word timings (~230k JSON values for
 * a convention), far above the 100k value cap of the global `jsonBody`. This
 * route skips the global parser (`CUSTOM_BODY_PARSER_PATHS`) and parses itself,
 * behind the admin gate so the uncapped parser is never reachable for others.
 * Run after `requireAuth`.
 */
export const parteitageImportBodyParser: RequestHandler[] = [
  requireInstanceAdminMiddleware,
  express.json({ limit: '50mb' }),
];
