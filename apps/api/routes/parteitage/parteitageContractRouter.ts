/**
 * ts-rest router for the Parteitage archive. requireAuth and the read limiter
 * sit at the /api/parteitage prefix in routes.ts. Every door that returns
 * convention content goes through checkConventionAccess/checkSpeechAccess:
 * 'not_found' → 404, 'locked' → 403 LOCKED.
 */
import { type ParteitageErrorCode, parteitageContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  checkConventionAccess,
  checkSpeechAccess,
  isConventionVisible,
  viewerFromRequest,
} from '../../services/parteitage/access.js';
import {
  conventionSlug,
  getConventionById,
  getConventionBySlug,
  getSpeech,
  grant,
  hasGrant,
  listConventions,
  listSpeeches,
} from '../../services/parteitage/parteitageRepository.js';
import {
  buildEditorData,
  mediaUrl,
  toPublicSpeech,
} from '../../services/parteitage/parteitageViews.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { verifyPassword } from '../../utils/passwordHash.js';

import type { Application } from 'express';

const log = createLogger('parteitageContractRouter');

const err = <S extends 401 | 403 | 404 | 500>(
  status: S,
  code: ParteitageErrorCode,
  message: string
) => ({
  status,
  body: { success: false as const, code, message },
});
const notFound = () => err(404, 'NOT_FOUND', 'Parteitag nicht gefunden.');
const locked = () => err(403, 'LOCKED', 'Dieser Parteitag ist passwortgeschützt.');
const serverError = (message: string) => err(500, 'INTERNAL', message);

const s = initServer();

export const parteitageContractRouter = s.router(parteitageContract, {
  list: async ({ req }) => {
    try {
      const viewer = await viewerFromRequest(req);
      return { status: 200 as const, body: { conventions: await listConventions(viewer) } };
    } catch (error) {
      log.error('[parteitageContract.list] Error:', error);
      return serverError('Fehler beim Laden der Parteitage.');
    }
  },

  get: async ({ req, params }) => {
    try {
      const viewer = await viewerFromRequest(req);
      const convention = await getConventionBySlug(params.slug);
      if (!convention) return notFound();
      const access = checkConventionAccess(
        viewer,
        convention,
        await hasGrant(viewer.userId, convention.id)
      );
      if (access === 'not_found') return notFound();
      if (access === 'locked') return locked();

      const speeches = (await listSpeeches(convention.id)).filter(
        (sp) => viewer.isAdmin || sp.moderation === 'ok'
      );
      return {
        status: 200 as const,
        body: {
          id: convention.id,
          slug: conventionSlug(convention),
          title: convention.title,
          shortTitle: convention.short_title,
          organizer: convention.organizer,
          startsOn: convention.starts_on,
          endsOn: convention.ends_on,
          location: convention.location,
          locked: false,
          speechCount: speeches.length,
          stats: convention.stats,
          sourceLinks: convention.source_links,
          reportUrl: convention.report_media_id ? mediaUrl(convention.report_media_id) : null,
          speeches: speeches.map((sp) => toPublicSpeech(sp, { admin: viewer.isAdmin })),
        },
      };
    } catch (error) {
      log.error('[parteitageContract.get] Error:', error);
      return serverError('Fehler beim Laden des Parteitags.');
    }
  },

  unlock: async ({ req, params, body }) => {
    try {
      const viewer = await viewerFromRequest(req);
      const convention = await getConventionBySlug(params.slug);
      if (!convention || !isConventionVisible(viewer, convention)) return notFound();
      // Open conventions need no unlock and get no grant row.
      if (convention.access_password_hash) {
        if (!verifyPassword(body.password, convention.access_password_hash)) {
          return err(401, 'WRONG_PASSWORD', 'Falsches Passwort.');
        }
        await grant(viewer.userId, convention.id);
      }
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[parteitageContract.unlock] Error:', error);
      return serverError('Entsperren fehlgeschlagen.');
    }
  },

  getSpeech: async ({ req, params }) => {
    try {
      const resolved = await resolveSpeech(req, params.speechId);
      if (!resolved.ok) return resolved.response;
      const { speech } = resolved;
      return {
        status: 200 as const,
        body: { ...toPublicSpeech(speech), transcript: speech.transcript },
      };
    } catch (error) {
      log.error('[parteitageContract.getSpeech] Error:', error);
      return serverError('Fehler beim Laden der Rede.');
    }
  },

  editorData: async ({ req, params }) => {
    try {
      const resolved = await resolveSpeech(req, params.speechId);
      if (!resolved.ok) return resolved.response;
      return {
        status: 200 as const,
        body: await buildEditorData(resolved.convention, resolved.speech),
      };
    } catch (error) {
      log.error('[parteitageContract.editorData] Error:', error);
      return serverError('Fehler beim Laden der Editor-Daten.');
    }
  },
});

async function resolveSpeech(req: Parameters<typeof viewerFromRequest>[0], slugOrId: string) {
  const viewer = await viewerFromRequest(req);
  const speech = await getSpeech(slugOrId);
  const convention = speech ? await getConventionById(speech.convention_id) : null;
  if (!speech || !convention) return { ok: false as const, response: notFound() };
  const access = checkSpeechAccess(
    viewer,
    convention,
    speech,
    await hasGrant(viewer.userId, convention.id)
  );
  if (access === 'not_found') return { ok: false as const, response: notFound() };
  if (access === 'locked') return { ok: false as const, response: locked() };
  return { ok: true as const, convention, speech };
}

export function mountParteitageContractRouter(app: Application): void {
  createExpressEndpoints(parteitageContract, parteitageContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'parteitageContract'),
  });
}
