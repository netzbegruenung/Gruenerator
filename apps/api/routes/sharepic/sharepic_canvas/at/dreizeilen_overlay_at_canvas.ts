/**
 * Dreizeilen-Overlay AT napi-canvas renderer (Österreich / de-AT).
 *
 * Foto vollflächig, darauf eine zentrierte quadratische Farbfläche (Dunkel-
 * oder Hellgrün) mit zentrierter dreizeiliger Headline, Subline und mittigem
 * Logo. Mirrors dreizeilen_overlay_at_full.config.
 */
import { createCanvas, loadImage, type Canvas, type SKRSContext2D as Ctx } from '@napi-rs/canvas';
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
  OVERLAY,
  registerAtFonts,
  drawCoverImage,
  drawOverlayContent,
} from './atCanvasShared.js';

const log = createLogger('dreizeilen_ovl_at');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  line1?: string;
  accent?: string; // line 2 (yellow)
  line2?: string; // alias for accent
  line3?: string;
  subline?: string;
  /** Colour of the overlay box, not of the canvas. */
  boxColor?: string;
}

async function render(
  content: { line1: string; accent: string; line3: string; subline: string },
  boxColor: string,
  imageBuffer: Buffer | null
): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');

  // The photo is optional — without one the sujet is still valid, it just sits
  // on a solid field instead of an image.
  if (imageBuffer) {
    drawCoverImage(ctx, await loadImage(imageBuffer));
  } else {
    ctx.fillStyle = AT_BRAND.primary;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  }

  ctx.fillStyle = boxColor;
  ctx.fillRect(OVERLAY.box.x, OVERLAY.box.y, OVERLAY.box.width, OVERLAY.box.height);

  await drawOverlayContent(ctx, content);

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { line1, accent, line2, line3, subline, boxColor } = req.body as Body;
    const mid = (accent ?? line2 ?? '').trim();
    if (!line1 && !mid && !line3) {
      res.status(400).json({ error: 'Mindestens eine Zeile ist erforderlich' });
      return;
    }
    const box = isValidHexColor(boxColor) ? boxColor! : AT_BRAND.primary;
    const raw = await render(
      {
        line1: (line1 ?? '').trim(),
        accent: mid,
        line3: (line3 ?? '').trim(),
        subline: (subline ?? '').trim(),
      },
      box,
      req.file?.buffer ?? null
    );
    const optimized = await optimizeCanvasBuffer(raw);
    res.json({ image: bufferToBase64(optimized) });
  } catch (err) {
    const error = err as Error;
    log.error('Error in dreizeilen_overlay_at_canvas:', error);
    res
      .status(500)
      .json({ error: 'Fehler beim Erstellen des Overlay-Bildes (AT): ' + error.message });
  }
});

export default router;
