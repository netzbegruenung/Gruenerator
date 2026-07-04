/**
 * Presentation export routes (binary downloads sit outside the ts-rest AI
 * contract). Mounted under /api/presentations, which already applies requireAuth.
 */

import express, { type Response, type Router } from 'express';

import { loadPresentationState } from '../../services/presentations/PresentationGenerationService.js';
import { createLogger } from '../../utils/logger.js';

import {
  contentDispositionAttachment,
  exportPresentationToPptx,
  PandocUnavailableError,
} from './presentationPptxExport.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('PresentationExport');
const router: Router = express.Router();

router.post('/:id/export/pptx', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  try {
    const state = await loadPresentationState(id, userId);
    if (!state) {
      res.status(404).json({ error: 'Präsentation nicht gefunden' });
      return;
    }
    const buffer = await exportPresentationToPptx(state.slides, state.title);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Disposition', contentDispositionAttachment(state.title));
    res.send(buffer);
  } catch (err) {
    if (err instanceof PandocUnavailableError) {
      res.status(501).json({
        error: 'PPTX-Export benötigt pandoc, das auf diesem Server nicht installiert ist.',
      });
      return;
    }
    log.error('[Presentations] PPTX export failed:', err);
    res.status(500).json({ error: 'PPTX-Export fehlgeschlagen' });
  }
});

export default router;
