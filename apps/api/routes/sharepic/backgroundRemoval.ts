import { Router, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';

import { removeBackgroundWithRembg } from '../../services/image/rembgIntegration.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backgroundRemoval');
const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/', upload.single('image'), (async (
  req: MulterRequest,
  res: Response
): Promise<void> => {
  try {
    const imageBuffer = req.file?.buffer;
    if (!imageBuffer) {
      res.status(400).json({ error: 'Bild ist erforderlich' });
      return;
    }

    log.info(`Starting background removal (${imageBuffer.length} bytes)`);
    const resultBuffer = await removeBackgroundWithRembg(
      imageBuffer,
      req.file?.originalname ?? 'image.png'
    );

    const base64 = resultBuffer.toString('base64');
    res.json({
      image: `data:image/png;base64,${base64}`,
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    log.error(`Background removal error: ${message}`);
    res.status(500).json({ error: 'Fehler bei der Hintergrundentfernung' });
  }
}) as RequestHandler);

export default router;
