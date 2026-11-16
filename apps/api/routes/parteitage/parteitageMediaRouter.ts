/**
 * GET /api/parteitage/media/:mediaId — streams reel, poster and report after the
 * same access check as the JSON routes (speech-level for a speech's media).
 */
import path from 'node:path';

import { type ParteitageErrorCode } from '@gruenerator/contracts';
import { Router, type Request, type Response } from 'express';

import {
  checkConventionAccess,
  checkSpeechAccess,
  viewerFromRequest,
} from '../../services/parteitage/access.js';
import {
  findOwnerOfMedia,
  getConventionById,
  getSpeech,
  hasGrant,
} from '../../services/parteitage/parteitageRepository.js';
import { downloadBaseName, getMedia } from '../../services/parteitage/parteitageViews.js';
import { buildVtt } from '../../services/parteitage/vtt.js';
import { getSystemMediaStorage } from '../../services/systemMedia/storage.js';
import { streamFile } from '../../utils/http/streamFile.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('parteitageMediaRouter');

const fail = (res: Response, status: 403 | 404 | 500, code: ParteitageErrorCode, message: string) =>
  res.status(status).json({ success: false, code, message });

export async function parteitageMediaHandler(req: Request, res: Response): Promise<void> {
  try {
    const mediaId = String(req.params.mediaId);
    const owner = await findOwnerOfMedia(mediaId);
    if (!owner) {
      fail(res, 404, 'NOT_FOUND', 'Datei nicht gefunden.');
      return;
    }
    const viewer = await viewerFromRequest(req);
    const granted = await hasGrant(viewer.userId, owner.convention.id);
    const access = owner.speech
      ? checkSpeechAccess(viewer, owner.convention, owner.speech, granted)
      : checkConventionAccess(viewer, owner.convention, granted);
    if (access === 'not_found') {
      fail(res, 404, 'NOT_FOUND', 'Datei nicht gefunden.');
      return;
    }
    if (access === 'locked') {
      fail(res, 403, 'LOCKED', 'Dieser Parteitag ist passwortgeschützt.');
      return;
    }

    const media = await getMedia(mediaId);
    const storage = getSystemMediaStorage();
    const stat = media ? await storage.stat(media.storage_key) : null;
    if (!media || !stat) {
      fail(res, 404, 'NOT_FOUND', 'Datei nicht gefunden.');
      return;
    }

    const downloadName =
      req.query.download === '1'
        ? `${downloadBaseName(owner.convention, owner.speech)}${path.extname(media.storage_key)}`
        : null;
    res.setHeader('Cache-Control', 'private, max-age=3600');
    streamFile(req, res, {
      size: stat.size,
      contentType: media.mime_type,
      open: (range) => storage.openRead(media.storage_key, range),
      downloadName,
    });
  } catch (error) {
    log.error('[parteitageMedia] Error:', error);
    if (!res.headersSent) fail(res, 500, 'INTERNAL', 'Fehler beim Laden der Datei.');
  }
}

/** GET /api/parteitage/reden/:speechId/untertitel.vtt — captions behind the speech access check. */
export async function parteitageCaptionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const viewer = await viewerFromRequest(req);
    const speech = await getSpeech(String(req.params.speechId));
    const convention = speech ? await getConventionById(speech.convention_id) : null;
    if (!speech || !convention) {
      fail(res, 404, 'NOT_FOUND', 'Rede nicht gefunden.');
      return;
    }
    const access = checkSpeechAccess(
      viewer,
      convention,
      speech,
      await hasGrant(viewer.userId, convention.id)
    );
    if (access === 'not_found') {
      fail(res, 404, 'NOT_FOUND', 'Rede nicht gefunden.');
      return;
    }
    if (access === 'locked') {
      fail(res, 403, 'LOCKED', 'Dieser Parteitag ist passwortgeschützt.');
      return;
    }
    const vtt = buildVtt(speech.words);
    if (!vtt) {
      fail(res, 404, 'NOT_FOUND', 'Keine Untertitel vorhanden.');
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type('text/vtt; charset=utf-8').send(vtt);
  } catch (error) {
    log.error('[parteitageCaptions] Error:', error);
    if (!res.headersSent) fail(res, 500, 'INTERNAL', 'Fehler beim Laden der Untertitel.');
  }
}

export const parteitageMediaRouter = Router();
parteitageMediaRouter.get('/api/parteitage/reden/:speechId/untertitel.vtt', (req, res) => {
  void parteitageCaptionsHandler(req, res);
});
parteitageMediaRouter.get('/api/parteitage/media/:mediaId', (req, res) => {
  void parteitageMediaHandler(req, res);
});
