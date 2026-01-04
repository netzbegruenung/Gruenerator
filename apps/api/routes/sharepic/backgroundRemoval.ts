import { Router, Request, Response } from 'express';
import multer from 'multer';
import { removeBackground } from '@imgly/background-removal-node';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('background_removal');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/', upload.single('image'), async (req: MulterRequest, res: Response) => {
  try {
    const imageBuffer = req.file?.buffer;

    if (!imageBuffer) {
      log.warn('No image provided for background removal');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }

    log.info('Starting background removal');

    const blob = await removeBackground(imageBuffer);
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    log.info('Background removal completed');

    res.json({
      image: `data:image/png;base64,${base64}`,
      success: true
    });
  } catch (error) {
    log.error('Background removal error:', error);
    res.status(500).json({ error: 'Fehler bei der Hintergrundentfernung' });
  }
});

export default router;
