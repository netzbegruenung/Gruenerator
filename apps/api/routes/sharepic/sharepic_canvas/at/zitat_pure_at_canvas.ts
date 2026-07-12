/**
 * Zitat-Pur AT napi-canvas renderer (Österreich / de-AT).
 * Dunkelgrüne Fläche, zentriertes weißes Anführungszeichen + Zitat (Gotham),
 * gelber Name. Mirrors zitat_pure_at_full.config.tsx.
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

import { AT_BRAND, CANVAS, registerAtFonts, wrapText, drawLines } from './atCanvasShared.js';

const log = createLogger('zitat_pure_at_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  quote: string;
  name?: string;
  backgroundColor?: string;
}

function render(quote: string, name: string, backgroundColor: string): Buffer {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');
  const cx = CANVAS.width / 2;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const margin = 75;
  const maxWidth = CANVAS.width - margin * 2;

  // Dynamic quote font size (mirror DE zitat-pure scaling)
  let quoteFontSize = 81;
  ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
  let lines = wrapText(ctx, quote, maxWidth);
  if (lines.length <= 5) {
    quoteFontSize = Math.min(Math.round(quoteFontSize * 1.2), 97);
    ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
    lines = wrapText(ctx, quote, maxWidth);
  }
  const lineHeight = quoteFontSize * 1.2;
  const quoteMarkSize = 120;
  const gapMarkToText = 20;
  const gapQuoteToName = 60;
  const nameFontSize = Math.min(Math.round(quoteFontSize * 0.5), 42);

  const totalHeight =
    quoteMarkSize + gapMarkToText + lines.length * lineHeight + gapQuoteToName + nameFontSize;
  const top = 120;
  const available = CANVAS.height - 100 - top;
  const startY = top + Math.max(0, (available - totalHeight) / 2);

  // Quote mark (white, text-drawn)
  ctx.fillStyle = AT_BRAND.textOnDark;
  ctx.font = `${quoteMarkSize}px ${AT_BRAND.fonts.headline}`;
  ctx.fillText('“', cx, startY);

  // Quote (white, Gotham, centred)
  ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
  const quoteY = startY + quoteMarkSize + gapMarkToText;
  const afterQuoteY = drawLines(ctx, lines, cx, quoteY, lineHeight);

  // Name (yellow)
  if (name) {
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `${nameFontSize}px ${AT_BRAND.fonts.body}`;
    ctx.fillText(name, cx, afterQuoteY + gapQuoteToName - lineHeight + quoteFontSize * 0.2);
  }

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { quote, name, backgroundColor } = req.body as Body;
    if (!quote) {
      res.status(400).json({ error: 'Ein Zitat ist erforderlich' });
      return;
    }
    const bg = isValidHexColor(backgroundColor) ? backgroundColor! : AT_BRAND.primary;
    const raw = render(quote.trim(), (name ?? '').trim(), bg);
    const optimized = await optimizeCanvasBuffer(raw);
    res.json({ image: bufferToBase64(optimized) });
  } catch (err) {
    const error = err as Error;
    log.error('Error in zitat_pure_at_canvas:', error);
    res
      .status(500)
      .json({ error: 'Fehler beim Erstellen des Zitat-Pur-Bildes (AT): ' + error.message });
  }
});

export default router;
