/**
 * Zitat-Pur AT napi-canvas renderer (Österreich / de-AT).
 * Einfarbige Fläche, mittiges weißes Anführungszeichen, weißes Zitat in
 * Gotham Narrow Ultra, gelber Name.
 *
 * Spiegelbild von zitat_pure_at_full.config.tsx / zitatPureAtLayout.ts —
 * beide Dateien sind handverdrahtet und müssen zusammen geändert werden.
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
  ZITAT_PURE,
  registerAtFonts,
  wrapText,
  loadAtQuoteWhite,
} from './atCanvasShared.js';

const log = createLogger('zitat_pure_at_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  quote: string;
  name?: string;
  backgroundColor?: string;
}

async function render(quote: string, name: string, backgroundColor: string): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');
  const cx = CANVAS.width / 2;
  const Z = ZITAT_PURE;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const measure = (size: number): string[] => {
    ctx.font = `${size}px ${AT_BRAND.fonts.quoteShort}`;
    return wrapText(ctx, quote, Z.maxWidth);
  };

  // Autofit: kurze Zitate duerfen wachsen, lange muessen weichen. Die
  // Zeilenzahl kommt aus measureText, nicht aus einer Zeichenbreiten-Schaetzung
  // — bei Gotham Narrow Ultra liegt die um mehrere Zeilen daneben.
  let fontSize = Z.baseFontSize;
  let lines = measure(fontSize);
  while (lines.length <= Z.growBelowLines && fontSize < Z.maxFontSize) {
    const next = measure(fontSize + 4);
    if (next.length > Z.growBelowLines) break;
    fontSize += 4;
    lines = next;
  }
  while (lines.length > Z.maxLines && fontSize > Z.minFontSize) {
    fontSize -= 4;
    lines = measure(fontSize);
  }

  const lineHeight = Math.round(fontSize * Z.lineHeightRatio);
  const nameFontSize = Math.round(fontSize * Z.nameFontSizeRatio);
  const markSize = Math.round(fontSize * Z.markSizeRatio);
  const nameGap = Math.round(fontSize * Z.nameGapRatio);

  const quoteHeight = lines.length * lineHeight;
  const nameHeight = name ? nameGap + nameFontSize : 0;
  const groupHeight = markSize + Z.markGapToText + quoteHeight + nameHeight;
  const centred = Math.round(CANVAS.height * Z.groupCenterRatio - groupHeight / 2);
  const groupTop = Math.max(Z.topBoundary, Math.min(centred, Z.bottomBoundary - groupHeight));
  const quoteY = groupTop + markSize + Z.markGapToText;

  const mark = await loadAtQuoteWhite();
  ctx.drawImage(mark, Math.round(cx - markSize / 2), groupTop, markSize, markSize);

  ctx.fillStyle = AT_BRAND.textOnDark;
  ctx.font = `${fontSize}px ${AT_BRAND.fonts.quoteShort}`;
  lines.forEach((line, i) => ctx.fillText(line, cx, quoteY + i * lineHeight));

  if (name) {
    ctx.fillStyle = AT_BRAND.accent;
    ctx.font = `${nameFontSize}px ${AT_BRAND.fonts.body}`;
    ctx.fillText(name, cx, quoteY + quoteHeight + nameGap);
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
