/**
 * Info AT napi-canvas renderer (Österreich / de-AT).
 * Dunkelgrüne Fläche, zentrierte weiße Gotham-Headline, gelbe Vollkorn-
 * Betonung, weiße Subline, weißes Ein-Balken-Logo. Mirrors info_at_full.config.
 */
import { createCanvas, type Canvas, type SKRSContext2D as Ctx } from '@napi-rs/canvas';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import {
  optimizeCanvasBuffer,
  bufferToBase64,
} from '../../../../services/sharepic/canvas/imageOptimizer.js';
import { isValidHexColor } from '../../../../services/sharepic/canvas/utils.js';
import { createLogger } from '../../../../utils/logger.js';

import {
  AT_BRAND,
  CANVAS,
  registerAtFonts,
  drawHeadlineStack,
  drawAtLogo,
} from './atCanvasShared.js';

const log = createLogger('info_at_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  headline: string;
  accent?: string;
  body?: string;
  backgroundColor?: string;
}

async function render(
  headline: string,
  accent: string,
  body: string,
  backgroundColor: string
): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

  drawHeadlineStack(
    ctx,
    [
      { text: headline, kind: 'headline' },
      { text: accent, kind: 'accent' },
      { text: body, kind: 'body' },
    ],
    'center'
  );
  await drawAtLogo(ctx, 'center');

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { headline, accent, body, backgroundColor } = req.body as Body;
    if (!headline && !accent && !body) {
      res.status(400).json({ error: 'Mindestens eine Textzeile ist erforderlich' });
      return;
    }
    const bg = isValidHexColor(backgroundColor) ? backgroundColor! : AT_BRAND.primary;
    const raw = await render(
      (headline ?? '').trim(),
      (accent ?? '').trim(),
      (body ?? '').trim(),
      bg
    );
    const optimized = await optimizeCanvasBuffer(raw);
    res.json({ image: bufferToBase64(optimized) });
  } catch (err) {
    const error = err as Error;
    log.error('Error in info_at_canvas:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Info-Bildes (AT): ' + error.message });
  }
});

export default router;
