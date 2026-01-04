import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 85, b: 56 }; // Default to TANNE
}

router.post('/', upload.single('image'), async (req: MulterRequest, res: Response) => {
  try {
    const imageBuffer = req.file?.buffer;
    const body = req.body as ProfilbildRequestBody;

    if (!imageBuffer) {
      log.warn('No image provided for profilbild canvas');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }

    const backgroundColor = body.backgroundColor && isValidHexColor(body.backgroundColor)
      ? body.backgroundColor
      : COLORS.TANNE;

    log.info('Creating profilbild with sharp', { backgroundColor });

    const personImage = sharp(imageBuffer);
    const metadata = await personImage.metadata();
    const origWidth = metadata.width || PROFILBILD_SIZE;
    const origHeight = metadata.height || PROFILBILD_SIZE;

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

    const resizedPerson = await personImage
      .resize(scaledWidth, scaledHeight, { fit: 'fill' })
      .toBuffer();

    const rgb = hexToRgb(backgroundColor);
    const result = await sharp({
      create: {
        width: PROFILBILD_SIZE,
        height: PROFILBILD_SIZE,
        channels: 3,
        background: rgb
      }
    })
      .composite([{
        input: resizedPerson,
        left: x,
        top: y
      }])
      .png({ quality: 90 })
      .toBuffer();

    const base64Image = `data:image/png;base64,${result.toString('base64')}`;

    log.info('Profilbild completed');

    res.json({ image: base64Image });
  } catch (error) {
    log.error('Profilbild error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Profilbilds' });
  }
});

export default router;
