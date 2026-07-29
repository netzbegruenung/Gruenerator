/**
 * Info AT napi-canvas renderer (Österreich / de-AT).
 * Farbfläche, Logo rechts oben, darunter mittig eine kleine Introline
 * (Gotham Book, weiß), der Infotext (Gotham Ultra, weiß) und eine gelbe
 * Vollkorn-Schlusszeile.
 *
 * Spiegelbild von info_at_full.config.tsx / infoAtLayout.ts — beide Dateien
 * sind handverdrahtet und müssen zusammen geändert werden.
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

import { AT_BRAND, CANVAS, INFO, registerAtFonts, wrapText, drawAtLogo } from './atCanvasShared.js';

const log = createLogger('info_at_canvas');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Body {
  introline?: string;
  text: string;
  accent?: string;
  backgroundColor?: string;
}

interface Zone {
  text: string;
  font: (size: number) => string;
  /** Grundgröße vor der gemeinsamen Skalierung. */
  base: number;
  lineHeightRatio: number;
  fill: string;
}

async function render(
  introline: string,
  text: string,
  accent: string,
  backgroundColor: string
): Promise<Buffer> {
  registerAtFonts();
  const canvas: Canvas = createCanvas(CANVAS.width, CANVAS.height);
  const ctx: Ctx = canvas.getContext('2d');
  const cx = CANVAS.width / 2;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const zones: Zone[] = [
    {
      text: introline,
      font: (s) => `${s}px ${AT_BRAND.fonts.body}`,
      base: INFO.introFontSize,
      lineHeightRatio: INFO.introLineHeightRatio,
      fill: AT_BRAND.textOnDark,
    },
    {
      text,
      font: (s) => `${s}px ${AT_BRAND.fonts.headline}`,
      base: INFO.textFontSize,
      lineHeightRatio: INFO.lineHeightRatio,
      fill: AT_BRAND.textOnDark,
    },
    {
      text: accent,
      font: (s) => `italic ${s}px ${AT_BRAND.fonts.quoteEmphasis}`,
      base: INFO.textFontSize,
      lineHeightRatio: INFO.lineHeightRatio,
      fill: AT_BRAND.accent,
    },
  ];

  const measure = (scale: number): { lines: string[][]; heights: number[]; total: number } => {
    const lines: string[][] = [];
    const heights: number[] = [];
    for (const z of zones) {
      if (!z.text) {
        lines.push([]);
        heights.push(0);
        continue;
      }
      const size = Math.round(z.base * scale);
      ctx.font = z.font(size);
      const wrapped = wrapText(ctx, z.text, INFO.maxWidth);
      lines.push(wrapped);
      heights.push(wrapped.length * size * z.lineHeightRatio);
    }
    const gap = heights[0]! > 0 ? INFO.introGap : 0;
    const shift =
      heights[2]! > 0 ? Math.round(INFO.textFontSize * scale * INFO.accentLeadShiftRatio) : 0;
    return { lines, heights, total: heights.reduce((a, b) => a + b, 0) + gap + shift };
  };

  // Waechst die Schrift ueber die breiteste Wortbreite hinaus, bricht der
  // Umbruch INNERHALB des Wortes — dieselbe Schranke wie im Konva-Pfad.
  const longestWordFits = (scale: number): boolean =>
    zones.every((z) => {
      if (!z.text) return true;
      ctx.font = z.font(Math.round(z.base * scale));
      return z.text.split(/\s+/).every((w) => ctx.measureText(w).width <= INFO.maxWidth);
    });

  const available = INFO.bottomBoundary - INFO.topBoundary;
  const minScale = INFO.minTextFontSize / INFO.textFontSize;
  const maxScale = INFO.maxTextFontSize / INFO.textFontSize;
  let scale = 1;
  let m = measure(scale);
  // Kurze Aussagen wachsen, lange weichen — spiegelt calculateInfoAtLayout.
  while (m.total <= available && scale < maxScale) {
    const step = scale + 0.04;
    const next = measure(step);
    if (next.total > available || !longestWordFits(step)) break;
    scale = step;
    m = next;
  }
  while (m.total > available && scale > minScale) {
    scale = Math.max(minScale, scale - 0.04);
    m = measure(scale);
  }

  const centred = Math.round(CANVAS.height * INFO.groupCenterRatio - m.total / 2);
  let y = Math.max(INFO.topBoundary, Math.min(centred, INFO.bottomBoundary - m.total));

  zones.forEach((z, i) => {
    if (i === 1 && m.heights[0]! > 0) y += INFO.introGap;
    const size = Math.round(z.base * scale);
    ctx.font = z.font(size);
    ctx.fillStyle = z.fill;
    const lineHeight = size * z.lineHeightRatio;
    const shift = i === 2 ? size * INFO.accentLeadShiftRatio : 0;
    (m.lines[i] ?? []).forEach((line, n) =>
      ctx.fillText(line, cx, Math.round(y + shift + n * lineHeight))
    );
    y += m.heights[i] ?? 0;
  });

  await drawAtLogo(ctx, {
    x: CANVAS.width - INFO.logo.margin - INFO.logo.width,
    y: INFO.logo.margin,
    width: INFO.logo.width,
  });

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { introline, text, accent, backgroundColor } = req.body as Body;
    if (!text) {
      res.status(400).json({ error: 'Ein Infotext ist erforderlich' });
      return;
    }
    const bg = isValidHexColor(backgroundColor) ? backgroundColor! : AT_BRAND.primary;
    const raw = await render((introline ?? '').trim(), text.trim(), (accent ?? '').trim(), bg);
    const optimized = await optimizeCanvasBuffer(raw);
    res.json({ image: bufferToBase64(optimized) });
  } catch (err) {
    const error = err as Error;
    log.error('Error in info_at_canvas:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Info-Bildes (AT): ' + error.message });
  }
});

export default router;
