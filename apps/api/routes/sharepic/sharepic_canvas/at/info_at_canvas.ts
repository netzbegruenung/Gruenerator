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
  loadAtLogo,
  wrapText,
  drawLines,
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

const MARGIN_X = 90;
const MARGIN_TOP = 210;
const MAX_WIDTH = CANVAS.width - MARGIN_X * 2;
const GAP = 18;

async function render(
  headline: string,
  accent: string,
  body: string,
  backgroundColor: string
): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');
  const cx = CANVAS.width / 2;
  const lh = AT_BRAND.lineHeightFactor;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let y = MARGIN_TOP;

  // Headline (white Gotham Ultra)
  ctx.fillStyle = AT_BRAND.textOnDark;
  ctx.font = `104px ${AT_BRAND.fonts.headline}`;
  const hLines = wrapText(ctx, headline, MAX_WIDTH);
  y = drawLines(ctx, hLines, cx, y, 104 * lh) + (hLines.length ? GAP : 0);

  // Accent (yellow Vollkorn italic)
  if (accent) {
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `italic 104px ${AT_BRAND.fonts.quoteEmphasis}`;
    const aLines = wrapText(ctx, accent, MAX_WIDTH);
    y = drawLines(ctx, aLines, cx, y, 104 * lh) + (aLines.length ? GAP : 0);
  }

  // Body / subline (white Gotham Book)
  if (body) {
    ctx.fillStyle = AT_BRAND.textOnDark;
    ctx.font = `44px ${AT_BRAND.fonts.body}`;
    const bLines = wrapText(ctx, body, MAX_WIDTH);
    drawLines(ctx, bLines, cx, y + 22, 44 * 1.2);
  }

  // Logo (white one-bar, bottom-centre)
  const logo = await loadAtLogo();
  const lw = 300;
  const lhgt = lw * (logo.height / logo.width);
  ctx.drawImage(logo, cx - lw / 2, CANVAS.height - lhgt - 60, lw, lhgt);

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
