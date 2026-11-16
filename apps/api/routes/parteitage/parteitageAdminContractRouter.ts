/**
 * ts-rest router for the instance-admin Parteitage surface. requireAuth is
 * applied at the /api/admin/parteitage prefix; every handler checks the admin
 * flag itself (403 FORBIDDEN). The TUS upload path is mounted in server.ts.
 */
import { parteitageAdminContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';

import { conventions, conventionSpeeches } from '../../database/schema/parteitage.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { deleteConvention, deleteSpeech } from '../../services/parteitage/deleteService.js';
import {
  fileHashesForKey,
  ImportBlockedSpeechError,
  ImportFileMismatchError,
  ImportMissingUploadError,
  importConvention,
} from '../../services/parteitage/importService.js';
import {
  conventionSlug,
  getConventionById,
  getSpeech,
} from '../../services/parteitage/parteitageRepository.js';
import { listAllConventions } from '../../services/parteitage/parteitageViews.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { hashPassword } from '../../utils/passwordHash.js';

import type { Application } from 'express';

const log = createLogger('parteitageAdminContractRouter');

const err = <S extends 400 | 403 | 404 | 409 | 500>(status: S, code: string, message: string) => ({
  status,
  body: { success: false as const, code, message },
});
const forbidden = () => err(403, 'FORBIDDEN', 'Keine Admin-Berechtigung.');
const notFound = () => err(404, 'NOT_FOUND', 'Nicht gefunden.');
const serverError = (message: string) => err(500, 'INTERNAL', message);
const ok = () => ({ status: 200 as const, body: { success: true as const } });

const s = initServer();

type AdminReq = Parameters<typeof getAuthedUser>[0];
async function adminUser(req: AdminReq) {
  const user = getAuthedUser(req);
  return (await requireInstanceAdmin(user.id, user.email)) ? user : null;
}

export const parteitageAdminContractRouter = s.router(parteitageAdminContract, {
  listAll: async ({ req }) => {
    try {
      if (!(await adminUser(req))) return forbidden();
      return { status: 200 as const, body: { conventions: await listAllConventions() } };
    } catch (error) {
      log.error('[parteitageAdmin.listAll] Error:', error);
      return serverError('Fehler beim Laden der Parteitage.');
    }
  },

  fileHashes: async ({ req, params }) => {
    try {
      if (!(await adminUser(req))) return forbidden();
      return { status: 200 as const, body: await fileHashesForKey(params.key) };
    } catch (error) {
      log.error('[parteitageAdmin.fileHashes] Error:', error);
      return serverError('Fehler beim Laden der Dateien.');
    }
  },

  import: async ({ req, body }) => {
    try {
      const user = await adminUser(req);
      if (!user) return forbidden();
      const result = await importConvention({
        manifest: body.manifest,
        uploads: body.uploads,
        password: body.password,
        adminUserId: user.id,
      });
      const convention = await getConventionById(result.conventionId);
      if (!convention) return serverError('Import fehlgeschlagen.');
      return {
        status: 200 as const,
        body: {
          success: true as const,
          id: convention.id,
          slug: conventionSlug(convention),
          speechCount: result.speeches.added + result.speeches.updated + result.speeches.unchanged,
        },
      };
    } catch (error) {
      if (error instanceof ImportBlockedSpeechError) {
        return err(409, 'BLOCKED_SPEECHES', `Gesperrte Reden: ${error.keys.join(', ')}`);
      }
      if (error instanceof ZodError) return err(400, 'INVALID_MANIFEST', error.message);
      if (error instanceof ImportMissingUploadError || error instanceof ImportFileMismatchError) {
        return err(400, 'INVALID_MANIFEST', error.message);
      }
      log.error('[parteitageAdmin.import] Error:', error);
      return serverError('Import fehlgeschlagen.');
    }
  },

  update: async ({ req, params, body }) => {
    try {
      if (!(await adminUser(req))) return forbidden();
      const convention = await getConventionById(params.id);
      if (!convention) return notFound();
      const patch: Partial<typeof conventions.$inferInsert> = {};
      if (body.status !== undefined) {
        patch.status = body.status;
        if (body.status === 'published' && !convention.published_at) {
          patch.published_at = new Date();
        }
      }
      if (body.password !== undefined) {
        patch.access_password_hash = body.password === null ? null : hashPassword(body.password);
      }
      if (Object.keys(patch).length > 0) {
        await getDrizzleInstance()
          .update(conventions)
          .set(patch)
          .where(eq(conventions.id, convention.id));
      }
      return ok();
    } catch (error) {
      log.error('[parteitageAdmin.update] Error:', error);
      return serverError('Speichern fehlgeschlagen.');
    }
  },

  setSpeechHidden: async ({ req, params, body }) => {
    try {
      if (!(await adminUser(req))) return forbidden();
      const speech = await getSpeech(params.speechId);
      if (!speech) return notFound();
      await getDrizzleInstance()
        .update(conventionSpeeches)
        .set(
          body.hidden
            ? { moderation: 'hidden', hidden_reason: body.reason }
            : { moderation: 'ok', hidden_reason: null }
        )
        .where(eq(conventionSpeeches.id, speech.id));
      return ok();
    } catch (error) {
      log.error('[parteitageAdmin.setSpeechHidden] Error:', error);
      return serverError('Speichern fehlgeschlagen.');
    }
  },

  deleteSpeech: async ({ req, params }) => {
    try {
      if (!(await adminUser(req))) return forbidden();
      const speech = await getSpeech(params.speechId);
      if (!speech) return notFound();
      await deleteSpeech(speech.id);
      return ok();
    } catch (error) {
      log.error('[parteitageAdmin.deleteSpeech] Error:', error);
      return serverError('Löschen fehlgeschlagen.');
    }
  },

  deleteConvention: async ({ req, params }) => {
    try {
      if (!(await adminUser(req))) return forbidden();
      const convention = await getConventionById(params.id);
      if (!convention) return notFound();
      await deleteConvention(convention.id);
      return ok();
    } catch (error) {
      log.error('[parteitageAdmin.deleteConvention] Error:', error);
      return serverError('Löschen fehlgeschlagen.');
    }
  },
});

export function mountParteitageAdminContractRouter(app: Application): void {
  createExpressEndpoints(parteitageAdminContract, parteitageAdminContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'parteitageAdminContract'),
  });
}
