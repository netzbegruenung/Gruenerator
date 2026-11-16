/**
 * GET /api/parteitage/media/:mediaId — streams reel, poster and report after the
 * same access check as the JSON routes (speech-level for a speech's media).
 */
import path from 'node:path';

import { Router, type Request, type Response } from 'express';

import {
  checkConventionAccess,
  checkSpeechAccess,
  viewerFromRequest,
} from '../../services/parteitage/access.js';
import { findOwnerOfMedia, hasGrant } from '../../services/parteitage/parteitageRepository.js';
import { downloadBaseName, getMedia } from '../../services/parteitage/parteitageViews.js';
import { getSystemMediaStorage } from '../../services/systemMedia/storage.js';
import { streamFile } from '../../utils/http/streamFile.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('parteitageMediaRouter');

const fail = (res: Response, status: 403 | 404 | 500, code: string, message: string) =>
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

export const parteitageMediaRouter = Router();
parteitageMediaRouter.get('/api/parteitage/media/:mediaId', (req, res) => {
  void parteitageMediaHandler(req, res);
});
