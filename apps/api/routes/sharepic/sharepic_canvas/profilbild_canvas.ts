import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { COLORS } from '../../../services/sharepic/canvas/config.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('profilbild_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const PROFILBILD_SIZE = 1080;
const PERSON_SCALE = 0.85;

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

interface ProfilbildRequestBody {
  backgroundColor?: string;
}

function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

router.post('/', upload.single('image'), async (req: MulterRequest, res: Response) => {
  try {
    const imageBuffer = req.file?.buffer;
    const body = req.body as ProfilbildRequestBody;

    if (!imageBuffer) {
      log.warn('No image provided for profilbild canvas');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }

    const backgroundColor =
      body.backgroundColor && isValidHexColor(body.backgroundColor)
        ? body.backgroundColor
        : COLORS.TANNE;

    log.info('Creating profilbild with canvas', { backgroundColor });

    const personImage = await loadImage(imageBuffer);
    const origWidth = personImage.width;
    const origHeight = personImage.height;

    const aspectRatio = origWidth / origHeight;
    let scaledWidth: number;
    let scaledHeight: number;

    if (aspectRatio > 1) {
      scaledWidth = Math.round(PROFILBILD_SIZE * PERSON_SCALE);
      scaledHeight = Math.round(scaledWidth / aspectRatio);
    } else {
      scaledHeight = Math.round(PROFILBILD_SIZE * PERSON_SCALE);
      scaledWidth = Math.round(scaledHeight * aspectRatio);
    }

    const x = Math.round((PROFILBILD_SIZE - scaledWidth) / 2);
    const y = PROFILBILD_SIZE - scaledHeight; // Anchor to bottom

    const canvas = createCanvas(PROFILBILD_SIZE, PROFILBILD_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, PROFILBILD_SIZE, PROFILBILD_SIZE);

    ctx.drawImage(personImage, x, y, scaledWidth, scaledHeight);

    const result = canvas.toBuffer('image/png');
    const base64Image = `data:image/png;base64,${result.toString('base64')}`;

    log.info('Profilbild completed');

    return res.json({ image: base64Image });
  } catch (error) {
    log.error('Profilbild error:', error);
    return res.status(500).json({ error: 'Fehler beim Erstellen des Profilbilds' });
  }
});

export default router;
