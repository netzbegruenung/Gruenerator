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

import { AT_BRAND, CANVAS, registerAtFonts, wrapText, loadAtQuoteWhite } from './atCanvasShared.js';

const log = createLogger('zitat_pure_at_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  quote: string;
  name?: string;
  backgroundColor?: string;
}

// Geometry mirrors calculateZitatPureLayout (canvas-editor zitatPureLayout.ts),
// the source of truth the konva editor renders from — so server ↔ Studio stay
// pixel-close. Centred variant: quote mark, quote and name are all centre-aligned.
async function render(quote: string, name: string, backgroundColor: string): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');
  const cx = CANVAS.width / 2;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const margin = 75;
  const maxWidth = CANVAS.width - margin * 2; // 930

  const quoteMarkSize = 100;
  const gapMarkToText = 20;
  const gapQuoteToName = 60;
  const topBoundary = 120;
  const availableHeight = CANVAS.height - 100 - topBoundary; // 1130

  // Dynamic quote/name font sizes — mirror calculateDynamicFontSize: a quote of
  // ≤5 lines is enlarged (and its name with it) up to the CI caps.
  let quoteFontSize = 81;
  let nameFontSize = 35;
  ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
  let lines = wrapText(ctx, quote, maxWidth);
  if (lines.length <= 5) {
    quoteFontSize = Math.min(Math.round(quoteFontSize * 1.2), 97);
    nameFontSize = Math.min(Math.round(nameFontSize * 1.2), 42);
    ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
    lines = wrapText(ctx, quote, maxWidth);
  }

  const lineHeight = quoteFontSize * 1.2;
  const quoteTextHeight = lines.length * lineHeight;
  const totalContentHeight =
    quoteMarkSize + gapMarkToText + quoteTextHeight + gapQuoteToName + nameFontSize;
  const contentStartY = topBoundary + (availableHeight - totalContentHeight) / 2;
  const quoteMarkY = Math.max(topBoundary, contentStartY);
  const quoteY = quoteMarkY + quoteMarkSize + gapMarkToText;

  // Quote mark (white SVG, centred) — same asset the konva config draws.
  const mark = await loadAtQuoteWhite();
  ctx.drawImage(mark, cx - quoteMarkSize / 2, quoteMarkY, quoteMarkSize, quoteMarkSize);

  // Quote (white Gotham, centred)
  ctx.fillStyle = AT_BRAND.textOnDark;
  ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
  lines.forEach((line, i) => ctx.fillText(line, cx, quoteY + i * lineHeight));

  // Name (yellow) — a clean gapQuoteToName below the quote block (authorY).
  if (name) {
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `${nameFontSize}px ${AT_BRAND.fonts.body}`;
    ctx.fillText(name, cx, quoteY + quoteTextHeight + gapQuoteToName);
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
    const raw = await render(quote.trim(), (name ?? '').trim(), bg);
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
