/**
 * ts-rest contract for the content-sync admin tab.
 *
 * Mounted under `/api/auth/admin/content-sync`: `requireAuth` at the prefix
 * (routes.ts), every handler checks `requireInstanceAdmin` itself.
 */
import { initContract } from '@ts-rest/core';

import {
  adminContentSyncErrorSchema,
  adminContentSyncRunsQuerySchema,
  adminContentSyncRunsResponseSchema,
  contentSyncSettingsSchema,
} from '../schemas/adminContentSync.js';

const c = initContract();

const ERRORS = {
  401: adminContentSyncErrorSchema,
  403: adminContentSyncErrorSchema,
  500: adminContentSyncErrorSchema,
} as const;

export const adminContentSyncContract = c.router(
  {
    listRuns: {
      method: 'GET',
      path: '/api/auth/admin/content-sync/runs',
      query: adminContentSyncRunsQuerySchema,
      responses: { 200: adminContentSyncRunsResponseSchema, ...ERRORS },
      summary: 'Letzte Content-Sync-Läufe (Admin)',
    },
    getSettings: {
      method: 'GET',
      path: '/api/auth/admin/content-sync/settings',
      responses: { 200: contentSyncSettingsSchema, ...ERRORS },
      summary: 'Content-Sync-Einstellungen (Admin)',
    },
    updateSettings: {
      method: 'PUT',
      path: '/api/auth/admin/content-sync/settings',
      body: contentSyncSettingsSchema,
      responses: { 200: contentSyncSettingsSchema, ...ERRORS },
      summary: 'Content-Sync-Mails ein- oder ausschalten (Admin)',
    },
  },
  { pathPrefix: '' }
);
