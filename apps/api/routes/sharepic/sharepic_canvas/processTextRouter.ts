import { Router, Request, Response } from 'express';
import { processText } from './dreizeilen_canvas.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('processText');
const router: Router = Router();

interface ProcessTextBody {
  line1?: string;
  line2?: string;
  line3?: string;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  log.debug('POST-Anfrage an /api/processText empfangen');
  log.debug('Body der Anfrage:', req.body);

  try {
    const result = await processText(req.body as ProcessTextBody);
    res.json({ success: true, message: 'Text erfolgreich verarbeitet', result });
  } catch (error) {
    log.error('Fehler bei der Textverarbeitung:', error);
    res
      .status(500)
      .json({
        error: (error as Error).message || 'Interner Serverfehler bei der Textverarbeitung',
      });
  }
});

export default router;
