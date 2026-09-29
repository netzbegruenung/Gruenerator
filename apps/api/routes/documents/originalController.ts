/**
 * GET /:id/original — die Originaldatei einer Quelle zum Herunterladen.
 *
 * Zugriff wie beim Dokument-Reader (`resolveReaderSource`): die Eigentümer*in
 * immer, andere nur über ein Notebook, in dem die Quelle steckt. Kein
 * ts-rest-Contract, weil die Antwort eine Datei ist, kein JSON.
 *
 * Das Original kommt vom Datenträger (Uploads, seit sie aufbewahrt werden) oder
 * aus der Wolke-Freigabe. Was vorher verarbeitet wurde, hat keins — dann 404.
 */
import express, { type Response, type Router } from 'express';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { originalFile } from '../../services/document-services/documentOriginals.js';
import {
  fetchOriginal,
  reindexOrigin,
} from '../../services/document-services/DocumentProcessingService/reindexOrigin.js';
import { resolveReaderSource } from '../../services/notebook/notebookSources.js';
import { createLogger } from '../../utils/logger.js';
import { checkNotebookAccess } from '../notebook/notebookAccess.js';

import type { DocumentRequest } from './types.js';

const log = createLogger('documents:original');
const router: Router = express.Router();
const notebookHelper = new NotebookQdrantHelper();

const NO_ORIGINAL = 'Für diese Quelle ist keine Originaldatei gespeichert.';

router.get(
  '/:id/original',
  async (req: DocumentRequest<{ id: string }>, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const documentId = req.params.id;
    const notebookId = typeof req.query.notebookId === 'string' ? req.query.notebookId : null;
    try {
      const db = getPostgresInstance();
      const source = await resolveReaderSource(
        { documentId, notebookId, userId },
        { db, helper: notebookHelper, access: checkNotebookAccess }
      );
      if (!source) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const [row] = await db.query<{
        filename: string | null;
        file_path: string | null;
        status: string | null;
        wolke_share_link_id: string | null;
        wolke_file_path: string | null;
      }>(
        `SELECT filename, file_path, status, wolke_share_link_id, wolke_file_path
         FROM documents WHERE id = $1 AND deleted_at IS NULL`,
        [documentId]
      );
      if (!row) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const filename = row.filename || source.title;

      const local = originalFile(row.file_path);
      if (local) {
        res.download(local, filename);
        return;
      }
      const origin = reindexOrigin({ ...row, id: documentId, user_id: source.ownerUserId });
      if (!origin) {
        res.status(404).json({ error: NO_ORIGINAL });
        return;
      }
      const file = await fetchOriginal(origin, { filename }, source.ownerUserId);
      res.attachment(filename);
      res.send(file.buffer);
    } catch (error) {
      log.error(`[GET /${documentId}/original] Error:`, error);
      res.status(502).json({ error: 'Die Originaldatei konnte nicht geladen werden.' });
    }
  }
);

export default router;
