/**
 * Zitat AT napi-canvas renderer (Österreich / de-AT).
 * Hintergrundfoto + Gradient, weißes Anführungszeichen + Zitat (Gotham),
 * gelber Name. Mirrors zitat_at_full.config.tsx.
 */
import { createCanvas, loadImage, type Canvas, type SKRSContext2D as Ctx } from '@napi-rs/canvas';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import {
  optimizeCanvasBuffer,
  bufferToBase64,
} from '../../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../../utils/logger.js';

import {
  AT_BRAND,
  CANVAS,
  registerAtFonts,
  wrapText,
  drawLines,
  loadAtQuoteWhite,
} from './atCanvasShared.js';

const log = createLogger('zitat_at_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  quote: string;
  name?: string;
}

async function render(imageBuffer: Buffer, quote: string, name: string): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');

  // Cover-fit background image
  const image = await loadImage(imageBuffer);
  const canvasAspect = CANVAS.width / CANVAS.height;
  let sx: number, sy: number, sWidth: number, sHeight: number;
  if (image.width / image.height > canvasAspect) {
    sHeight = image.height;
    sWidth = image.height * canvasAspect;
    sx = (image.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = image.width;
    sHeight = image.width / canvasAspect;
    sx = 0;
    sy = (image.height - sHeight) / 2;
  }
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, CANVAS.width, CANVAS.height);

  // Bottom gradient for contrast
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS.height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

  const margin = 50;
  const maxWidth = CANVAS.width - margin * 2;
  const quoteFontSize = 60;
  const lineHeight = Math.round(quoteFontSize * 1.17);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
  const lines = wrapText(ctx, quote, maxWidth);

  const quoteMarkSize = Math.round(quoteFontSize * 1.67);
  const quoteMarkY = 750;
  const quoteY = quoteMarkY + quoteMarkSize + 10;

  // Quote mark (white SVG) — same asset the konva zitat config draws.
  const mark = await loadAtQuoteWhite();
  ctx.drawImage(mark, margin, quoteMarkY, quoteMarkSize, quoteMarkSize);

  // Quote (white Gotham)
  ctx.fillStyle = AT_BRAND.textOnDark;
  ctx.font = `${quoteFontSize}px ${AT_BRAND.fonts.quoteShort}`;
  const afterQuoteY = drawLines(ctx, lines, margin, quoteY, lineHeight);

  // Name (yellow). Gap mirrors calculateZitatLayout (author.gapFromQuoteRatio 1.33).
  if (name) {
    const nameFontSize = Math.round(quoteFontSize * 0.67);
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `${nameFontSize}px ${AT_BRAND.fonts.body}`;
    ctx.fillText(name, margin, afterQuoteY + Math.round(quoteFontSize * 1.33));
  }

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { quote, name } = req.body as Body;
    if (!quote) {
      res.status(400).json({ error: 'Ein Zitat ist erforderlich' });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: 'Ein Hintergrundbild ist erforderlich' });
      return;
    }
    const raw = await render(req.file.buffer, quote.trim(), (name ?? '').trim());
    const optimized = await optimizeCanvasBuffer(raw);
    res.json({ image: bufferToBase64(optimized) });
  } catch (err) {
    const error = err as Error;
    log.error('Error in zitat_at_canvas:', error);
    res
      .status(500)
      .json({ error: 'Fehler beim Erstellen des Zitat-Bildes (AT): ' + error.message });
  }
});

export default router;
