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
  loadAtLogo,
  wrapText,
  drawLines,
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

const MARGIN_X = 90;
const MARGIN_TOP = 210;
const MAX_WIDTH = CANVAS.width - MARGIN_X * 2;
const GAP = 18;

async function render(
  line1: string,
  line2: string,
  line3: string,
  backgroundColor: string
): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');
  const lh = AT_BRAND.lineHeightFactor;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let y = MARGIN_TOP;

  const drawWhite = (text: string) => {
    if (!text) return;
    ctx.fillStyle = AT_BRAND.textOnDark;
    ctx.font = `104px ${AT_BRAND.fonts.headline}`;
    const lines = wrapText(ctx, text, MAX_WIDTH);
    y = drawLines(ctx, lines, MARGIN_X, y, 104 * lh) + GAP;
  };
  const drawAccent = (text: string) => {
    if (!text) return;
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `italic 104px ${AT_BRAND.fonts.quoteEmphasis}`;
    const lines = wrapText(ctx, text, MAX_WIDTH);
    y = drawLines(ctx, lines, MARGIN_X, y, 104 * lh) + GAP;
  };

  drawWhite(line1);
  drawAccent(line2);
  drawWhite(line3);

  // Logo (white one-bar, bottom-left)
  const logo = await loadAtLogo();
  const lw = 300;
  const lhgt = lw * (logo.height / logo.width);
  ctx.drawImage(logo, MARGIN_X, CANVAS.height - lhgt - 60, lw, lhgt);

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
