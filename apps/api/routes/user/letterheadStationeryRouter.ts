/**
 * Upload, Vorschau und Entfernen des eigenen Briefpapiers.
 *
 * Bewusst NICHT über ts-rest wie der Rest von /api/auth/letterheads: der
 * Contract beschreibt JSON-Bodies, und ein multipart-Upload durch ihn zu
 * zwingen kostet mehr, als es einbringt. Gleiches Muster wie beim Gruppenbild
 * (`groupAvatar.ts`) — der Dateiname landet über `setStationeryFile` wieder in
 * der contract-typisierten Zeile, die `listLetterheads` ausliefert.
 *
 * Jeder Handler ist auf `req.user.id` verengt: der Briefbogen trägt Logo und
 * Anschrift einer Gliederung, ein geratener Briefkopf darf ihn weder lesen noch
 * überschreiben.
 */

import express, { type Router, type Response } from 'express';
import multer from 'multer';

import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { getLetterhead, setStationeryFile } from '../../services/user/letterheadRepository.js';
import {
  deleteStationery,
  readStationery,
  saveStationery,
  STATIONERY_MAX_BYTES,
  STATIONERY_MIME_TYPES,
} from '../../services/user/letterheadStationery.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthRequest } from '../auth/types.js';

const log = createLogger('letterheadStationery');
const { requireAuth } = authMiddlewareModule;

const router: Router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STATIONERY_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (STATIONERY_MIME_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error(`Ungültiger Dateityp: ${file.mimetype}. Erlaubt: PDF, PNG, JPG`));
  },
});

const CONTENT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' } as const;

router.post(
  '/letterheads/:id/stationery',
  requireAuth,
  upload.single('stationery'),
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Nicht authentifiziert' });
      return;
    }
    try {
      const letterhead = await getLetterhead(userId, req.params.id);
      if (!letterhead) {
        res.status(404).json({ success: false, message: 'Briefkopf nicht gefunden.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, message: 'Keine Datei hochgeladen.' });
        return;
      }
      const type = STATIONERY_MIME_TYPES[req.file.mimetype];
      if (!type) {
        res.status(400).json({ success: false, message: 'Nur PDF, PNG oder JPG.' });
        return;
      }

      const fileName = await saveStationery(userId, req.file.buffer, type);
      await setStationeryFile(userId, req.params.id, fileName);
      // Erst nach dem erfolgreichen Umschalten löschen: bricht der Upload ab,
      // bleibt der alte Bogen der gültige.
      if (letterhead.stationery_file) {
        await deleteStationery(userId, letterhead.stationery_file);
      }

      log.info(`Briefbogen für Briefkopf ${req.params.id} gesetzt (${fileName})`);
      res.json({ success: true, stationery_file: fileName });
    } catch (err) {
      log.error('[uploadStationery]', err);
      res
        .status(500)
        .json({ success: false, message: 'Briefpapier konnte nicht gespeichert werden.' });
    }
  }
);

router.get(
  '/letterheads/:id/stationery',
  requireAuth,
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Nicht authentifiziert' });
      return;
    }
    const letterhead = await getLetterhead(userId, req.params.id);
    if (!letterhead?.stationery_file) {
      res.status(404).json({ success: false, message: 'Kein Briefpapier hinterlegt.' });
      return;
    }
    const file = await readStationery(userId, letterhead.stationery_file);
    if (!file) {
      res.status(404).json({ success: false, message: 'Briefpapier nicht mehr vorhanden.' });
      return;
    }
    res.setHeader('Content-Type', CONTENT_TYPES[file.type]);
    // Privat: der Bogen gehört einer Person, kein Zwischenspeicher darf ihn
    // für die nächste ausliefern.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(file.bytes);
  }
);

router.delete(
  '/letterheads/:id/stationery',
  requireAuth,
  async (req: AuthRequest<{ id: string }>, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Nicht authentifiziert' });
      return;
    }
    try {
      const letterhead = await getLetterhead(userId, req.params.id);
      if (!letterhead) {
        res.status(404).json({ success: false, message: 'Briefkopf nicht gefunden.' });
        return;
      }
      if (letterhead.stationery_file) {
        await setStationeryFile(userId, req.params.id, null);
        await deleteStationery(userId, letterhead.stationery_file);
      }
      res.json({ success: true });
    } catch (err) {
      log.error('[deleteStationery]', err);
      res
        .status(500)
        .json({ success: false, message: 'Briefpapier konnte nicht entfernt werden.' });
    }
  }
);

export default router;
