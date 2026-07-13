/**
 * Dreizeilen AT napi-canvas renderer (Österreich / de-AT).
 * Dunkelgrüne Fläche, dreizeilige Headline (Zeile 1+3 weiß Gotham, Zeile 2 gelb
 * Vollkorn), weißes Ein-Balken-Logo. Mirrors dreizeilen_at_full.config.
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

const log = createLogger('dreizeilen_at_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  line1?: string;
  accent?: string; // line 2 (yellow)
  line2?: string; // alias for accent
  line3?: string;
  backgroundColor?: string;
}

async function render(
  line1: string,
  line2: string,
  line3: string,
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
      { text: line1, kind: 'headline' },
      { text: line2, kind: 'accent' },
      { text: line3, kind: 'headline' },
    ],
    'left'
  );
  await drawAtLogo(ctx, 'left');

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { line1, accent, line2, line3, backgroundColor } = req.body as Body;
    const mid = (accent ?? line2 ?? '').trim();
    if (!line1 && !mid && !line3) {
      res.status(400).json({ error: 'Mindestens eine Zeile ist erforderlich' });
      return;
    }
    const bg = isValidHexColor(backgroundColor) ? backgroundColor! : AT_BRAND.primary;
    const raw = await render((line1 ?? '').trim(), mid, (line3 ?? '').trim(), bg);
    const optimized = await optimizeCanvasBuffer(raw);
    res.json({ image: bufferToBase64(optimized) });
  } catch (err) {
    const error = err as Error;
    log.error('Error in dreizeilen_at_canvas:', error);
    res
      .status(500)
      .json({ error: 'Fehler beim Erstellen des Dreizeilen-Bildes (AT): ' + error.message });
  }
});

export default router;
