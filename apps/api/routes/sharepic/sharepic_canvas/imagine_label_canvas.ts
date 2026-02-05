import {
  createCanvas,
  loadImage,
  type Canvas,
  type SKRSContext2D as CanvasRenderingContext2D,
} from '@napi-rs/canvas';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { COLORS } from '../../../services/sharepic/canvas/config.js';
import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import {
  optimizeCanvasBuffer,
  bufferToBase64,
} from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('imagine_label_c');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const LABEL_TEXT = 'KI-Generiert mit dem Grünerator';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

async function addKiLabel(imageBuffer: Buffer): Promise<Buffer> {
  await checkFiles();
  registerFonts();

  const img = await loadImage(imageBuffer);
  const { width, height } = img;

  const canvas: Canvas = createCanvas(width, height);
  const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0, width, height);

  const baseFontSize = Math.min(width, height) * 0.022;
  const fontSize = Math.max(12, Math.min(24, Math.round(baseFontSize)));
  const fontFamily = '600 ' + fontSize + 'px PTSans-Bold';

  ctx.font = fontFamily;
  ctx.textBaseline = 'middle';

  const textMetrics = ctx.measureText(LABEL_TEXT);
  const textWidth = textMetrics.width;
  const rectHorizontalPadding = Math.round(fontSize * 0.6);
  const rectVerticalPadding = Math.round(fontSize * 0.35);
  const margin = Math.round(fontSize * 0.4);
  const cornerRadius = Math.round(fontSize * 0.3);

  const rectWidth = textWidth + rectHorizontalPadding * 2;
  const rectHeight = fontSize + rectVerticalPadding * 2;
  const rectX = margin;
  const rectY = height - rectHeight - margin;

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#2B2B2B';
  ctx.beginPath();
  ctx.roundRect(rectX, rectY, rectWidth, rectHeight, cornerRadius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(LABEL_TEXT, rectX + rectHorizontalPadding, rectY + rectHeight / 2);
  ctx.restore();

  const rawBuffer = canvas.toBuffer('image/png');
  return optimizeCanvasBuffer(rawBuffer);
}

router.post(
  '/',
  upload.single('image'),
  async (req: MulterRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Kein Bild hochgeladen.' });
        return;
      }

      const outputBuffer = await addKiLabel(req.file.buffer);
      const base64Image = bufferToBase64(outputBuffer);

      res.json({ image: base64Image });
    } catch (error) {
      log.error('[imagine_label_canvas] Fehler beim Beschriften des Bildes:', error);
      res.status(500).json({ error: 'Fehler beim Beschriften des Bildes.' });
    }
  }
);

export default router;
export { addKiLabel };
