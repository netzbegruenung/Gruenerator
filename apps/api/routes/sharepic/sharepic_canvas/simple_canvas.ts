/**
 * Simple Canvas - Text auf Bild (Headline + Subtext on Background Image)
 * 1:1 match with frontend SimpleCanvas.tsx
 */

import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D, type Image } from 'canvas';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('simple_canvas');
const router: Router = Router();
const upload = multer({ dest: 'uploads/' });

try {
  registerFonts();
} catch (err) {
  log.error('Fehler beim Registrieren der Schriftarten:', err);
  process.exit(1);
}

// Configuration matching frontend simpleLayout.ts
const SIMPLE_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  headline: {
    x: 50,
    y: 80,
    maxWidth: 980,
    fontSize: 80,
    fontFamily: 'GrueneTypeNeue',
    color: '#FFFFFF',
    lineHeightRatio: 1.1,
  },
  subtext: {
    x: 50,
    gap: 15,
    maxWidth: 980,
    fontSize: 50,
    fontFamily: 'GrueneTypeNeue',
    color: '#FFD43B', // Sonne
    lineHeightRatio: 1.2,
  },
  gradient: {
    topOpacity: 0.1,
    bottomOpacity: 0.4,
  },
};

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

interface SimpleRequestBody {
  headline: string;
  subtext: string;
  headlineFontSize?: string;
  subtextFontSize?: string;
  gradientEnabled?: string;
  gradientOpacity?: string;
}

/**
 * Word-wrap text rendering helper
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY + lineHeight;
}

async function createSimpleImage(
  imagePath: string,
  outputImagePath: string,
  headline: string,
  subtext: string,
  headlineFontSize: number = SIMPLE_CONFIG.headline.fontSize,
  subtextFontSize: number = SIMPLE_CONFIG.subtext.fontSize,
  gradientEnabled: boolean = true,
  gradientOpacity: number = SIMPLE_CONFIG.gradient.bottomOpacity
): Promise<void> {
  try {
    log.debug('Lade Bild:', imagePath);
    const image = await loadImage(imagePath) as Image;
    log.debug('Bild erfolgreich geladen');

    const canvas: Canvas = createCanvas(SIMPLE_CONFIG.canvas.width, SIMPLE_CONFIG.canvas.height);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    // Draw background image (cover-fit)
    const imageAspectRatio = image.width / image.height;
    const canvasAspectRatio = SIMPLE_CONFIG.canvas.width / SIMPLE_CONFIG.canvas.height;

    let sx: number, sy: number, sWidth: number, sHeight: number;

    if (imageAspectRatio > canvasAspectRatio) {
      sHeight = image.height;
      sWidth = image.height * canvasAspectRatio;
      sx = (image.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = image.width;
      sHeight = image.width / canvasAspectRatio;
      sx = 0;
      sy = (image.height - sHeight) / 2;
    }

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, SIMPLE_CONFIG.canvas.width, SIMPLE_CONFIG.canvas.height);

    // Draw gradient overlay (if enabled)
    if (gradientEnabled) {
      const gradient = ctx.createLinearGradient(0, 0, 0, SIMPLE_CONFIG.canvas.height);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${SIMPLE_CONFIG.gradient.topOpacity})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, ${gradientOpacity})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, SIMPLE_CONFIG.canvas.width, SIMPLE_CONFIG.canvas.height);
    }

    // Calculate line heights
    const headlineLineHeight = Math.round(headlineFontSize * SIMPLE_CONFIG.headline.lineHeightRatio);
    const subtextLineHeight = Math.round(subtextFontSize * SIMPLE_CONFIG.subtext.lineHeightRatio);

    // Draw headline
    ctx.font = `bold ${headlineFontSize}px ${SIMPLE_CONFIG.headline.fontFamily}`;
    ctx.fillStyle = SIMPLE_CONFIG.headline.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const headlineEndY = wrapText(
      ctx,
      headline,
      SIMPLE_CONFIG.headline.x,
      SIMPLE_CONFIG.headline.y,
      SIMPLE_CONFIG.headline.maxWidth,
      headlineLineHeight
    );

    // Draw subtext
    const subtextY = headlineEndY + SIMPLE_CONFIG.subtext.gap - headlineLineHeight;
    ctx.font = `${subtextFontSize}px ${SIMPLE_CONFIG.subtext.fontFamily}`;
    ctx.fillStyle = SIMPLE_CONFIG.subtext.color;
    wrapText(
      ctx,
      subtext,
      SIMPLE_CONFIG.subtext.x,
      subtextY,
      SIMPLE_CONFIG.subtext.maxWidth,
      subtextLineHeight
    );

    const rawBuffer = canvas.toBuffer('image/png');
    const optimizedBuffer = await optimizeCanvasBuffer(rawBuffer);
    fs.writeFileSync(outputImagePath, optimizedBuffer);
    log.debug('Bild erfolgreich gespeichert:', outputImagePath);
  } catch (err) {
    log.error('Fehler beim Erstellen des Bildes:', err);
    throw err;
  }
}

router.post('/', upload.single('image'), async (req: MulterRequest, res: Response): Promise<void> => {
  let outputImagePath: string | undefined;
  try {
    const {
      headline,
      subtext,
      headlineFontSize: headlineFontSizeParam,
      subtextFontSize: subtextFontSizeParam,
      gradientEnabled: gradientEnabledParam,
      gradientOpacity: gradientOpacityParam
    } = req.body as SimpleRequestBody;

    if (!headline || typeof headline !== 'string') {
      throw new Error('Headline ist erforderlich');
    }
    if (!subtext || typeof subtext !== 'string') {
      throw new Error('Subtext ist erforderlich');
    }
    if (!req.file) {
      throw new Error('Bild ist erforderlich');
    }

    const headlineFontSize = Math.max(40, Math.min(120, parseInt(headlineFontSizeParam || String(SIMPLE_CONFIG.headline.fontSize), 10) || SIMPLE_CONFIG.headline.fontSize));
    const subtextFontSize = Math.max(30, Math.min(80, parseInt(subtextFontSizeParam || String(SIMPLE_CONFIG.subtext.fontSize), 10) || SIMPLE_CONFIG.subtext.fontSize));
    const gradientEnabled = gradientEnabledParam !== 'false';
    const gradientOpacity = parseFloat(gradientOpacityParam || String(SIMPLE_CONFIG.gradient.bottomOpacity)) || SIMPLE_CONFIG.gradient.bottomOpacity;

    const imagePath = req.file.path;
    outputImagePath = path.join('uploads', `output-${uuidv4()}.png`);

    await createSimpleImage(
      imagePath,
      outputImagePath,
      headline,
      subtext,
      headlineFontSize,
      subtextFontSize,
      gradientEnabled,
      gradientOpacity
    );

    const imageBuffer = fs.readFileSync(outputImagePath);
    const base64Image = bufferToBase64(imageBuffer);

    res.json({ image: base64Image });
  } catch (err) {
    const error = err as Error;
    log.error('Fehler bei der Anfrage:', error);
    res.status(500).send('Fehler beim Erstellen des Bildes: ' + error.message);
  } finally {
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) log.error('Fehler beim Löschen der temporären Upload-Datei:', err);
      });
    }
    if (outputImagePath) {
      fs.unlink(outputImagePath, (err) => {
        if (err) log.error('Fehler beim Löschen der temporären Output-Datei:', err);
      });
    }
  }
});

export default router;
