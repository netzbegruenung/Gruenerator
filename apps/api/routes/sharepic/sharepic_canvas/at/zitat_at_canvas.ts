/**
 * Zitat AT napi-canvas renderer (Österreich / de-AT).
 * Foto vollflächig, darüber ein dunkelgrüner Verlauf, darauf mittig das gelbe
 * Anführungszeichen, das weiße Zitat und der gelbe Name; Logo rechts oben.
 *
 * Spiegelbild von zitat_at_full.config.tsx / zitatAtLayout.ts — beide Dateien
 * sind handverdrahtet und müssen zusammen geändert werden.
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
  ZITAT,
  registerAtFonts,
  wrapText,
  drawLines,
  drawCoverImage,
  drawAtLogo,
  loadAtQuoteGelb,
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

  drawCoverImage(ctx, await loadImage(imageBuffer));

  // Kein Verlauf über dem Foto — die österreichische CI kennt keinen.

  const fontSize = ZITAT.baseFontSize;
  const lineHeight = Math.round(fontSize * ZITAT.lineHeightRatio);
  const nameFontSize = Math.round(fontSize * ZITAT.nameFontSizeRatio);
  const markSize = Math.round(fontSize * ZITAT.markSizeRatio);
  const nameGap = Math.round(fontSize * ZITAT.nameGapRatio);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${fontSize}px ${AT_BRAND.fonts.quoteShort}`;
  const lines = wrapText(ctx, quote, ZITAT.maxWidth);

  // Gruppe aus Anführungszeichen + Zitat + Name mittig um groupCenterRatio.
  const quoteHeight = lines.length * lineHeight;
  const nameHeight = name ? nameGap + nameFontSize : 0;
  const groupHeight = markSize + ZITAT.markGapToText + quoteHeight + nameHeight;
  const groupTop = Math.round(CANVAS.height * ZITAT.groupCenterRatio - groupHeight / 2);
  const quoteY = groupTop + markSize + ZITAT.markGapToText;

  const centerX = CANVAS.width / 2;

  const mark = await loadAtQuoteGelb();
  ctx.drawImage(mark, Math.round(centerX - markSize / 2), groupTop, markSize, markSize);

  ctx.fillStyle = AT_BRAND.textOnDark;
  const afterQuoteY = drawLines(ctx, lines, centerX, quoteY, lineHeight);

  if (name) {
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `${nameFontSize}px ${AT_BRAND.fonts.body}`;
    ctx.fillText(name, centerX, afterQuoteY + nameGap);
  }

  await drawAtLogo(ctx, {
    x: CANVAS.width - ZITAT.logo.margin - ZITAT.logo.width,
    y: ZITAT.logo.margin,
    width: ZITAT.logo.width,
  });

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
