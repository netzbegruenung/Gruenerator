import { Router, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import multer from 'multer';
import {
  createCanvas,
  loadImage,
  type Canvas,
  type SKRSContext2D as CanvasRenderingContext2D,
} from '@napi-rs/canvas';
import fs from 'fs/promises';
import path from 'path';
import { isValidHexColor } from '../../../services/sharepic/canvas/utils.js';
import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import {
  optimizeCanvasBuffer,
  bufferToBase64,
} from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('slider_canvas');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const ARROW_SVG_PATH = path.resolve(__dirname, '../../../public/arrow_right.svg');

// ============================================================================
// TYPES
// ============================================================================

interface SliderTextData {
  label: string;
  headline: string;
  subtext: string;
}

interface SliderParams {
  backgroundColor: string;
  pillBackgroundColor: string;
  pillTextColor: string;
  textColor: string;
  labelFontSize: number;
  headlineFontSize: number;
  subtextFontSize: number;
}

interface SliderRequestBody {
  label?: string;
  headline?: string;
  subtext?: string;
  colorScheme?: 'sand-tanne' | 'tanne-sand';
  backgroundColor?: string;
  pillBackgroundColor?: string;
  pillTextColor?: string;
  textColor?: string;
  labelFontSize?: string;
  headlineFontSize?: string;
  subtextFontSize?: string;
}

// ============================================================================
// COLOR SCHEMES
// ============================================================================

const COLOR_SCHEMES = {
  'sand-tanne': {
    background: '#F5F1E9',
    pillBackground: '#005538',
    pillText: '#FFFFFF',
    text: '#005538',
  },
  'tanne-sand': {
    background: '#005538',
    pillBackground: '#F5F1E9',
    pillText: '#005538',
    text: '#F5F1E9',
  },
} as const;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const MARGIN = 80;
const CONTENT_WIDTH = CANVAS_WIDTH - MARGIN * 2;

const PILL_CONFIG = {
  y: 120,
  paddingX: 40,
  paddingY: 16,
  cornerRadius: 50,
};

const HEADLINE_CONFIG = {
  gapFromPill: 60,
  lineHeight: 1.2,
};

const SUBTEXT_CONFIG = {
  gapFromHeadline: 50,
  lineHeight: 1.45,
};

const ARROW_CONFIG = {
  x: 820,
  y: 1100,
  size: 130,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && i > 0) {
      lines.push(currentLine.trim());
      currentLine = words[i] + ' ';
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine.trim());
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

async function processSliderText(textData: Partial<SliderTextData>): Promise<SliderTextData> {
  const { label, headline, subtext } = textData;

  return {
    label: label?.trim() || 'Wusstest du?',
    headline: headline?.trim() || '',
    subtext: subtext?.trim() || '',
  };
}

// ============================================================================
// MAIN IMAGE CREATION
// ============================================================================

async function createSliderImage(
  processedText: SliderTextData,
  validatedParams: SliderParams
): Promise<Buffer> {
  log.debug('Starting createSliderImage function');
  try {
    await checkFiles();
    registerFonts();

    const canvas: Canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    const {
      backgroundColor,
      pillBackgroundColor,
      pillTextColor,
      textColor,
      labelFontSize,
      headlineFontSize,
      subtextFontSize,
    } = validatedParams;

    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    log.debug('Background filled with color:', backgroundColor);

    // Calculate pill dimensions
    ctx.font = `italic ${labelFontSize}px GrueneTypeNeue`;
    const labelMetrics = ctx.measureText(processedText.label);
    const pillWidth = labelMetrics.width + PILL_CONFIG.paddingX * 2;
    const pillHeight = labelFontSize + PILL_CONFIG.paddingY * 2;

    // Draw pill background
    ctx.fillStyle = pillBackgroundColor;
    drawRoundedRect(ctx, MARGIN, PILL_CONFIG.y, pillWidth, pillHeight, PILL_CONFIG.cornerRadius);
    log.debug(`Pill drawn at (${MARGIN}, ${PILL_CONFIG.y}) with size ${pillWidth}x${pillHeight}`);

    // Draw pill label text
    ctx.fillStyle = pillTextColor;
    ctx.font = `italic ${labelFontSize}px GrueneTypeNeue`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      processedText.label,
      MARGIN + PILL_CONFIG.paddingX,
      PILL_CONFIG.y + PILL_CONFIG.paddingY
    );
    log.debug(`Pill label "${processedText.label}" rendered`);

    let currentY = PILL_CONFIG.y + pillHeight + HEADLINE_CONFIG.gapFromPill;

    // Draw headline
    if (processedText.headline) {
      ctx.fillStyle = textColor;
      ctx.font = `bold italic ${headlineFontSize}px GrueneTypeNeue`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const headlineLines = wrapText(ctx, processedText.headline, CONTENT_WIDTH);
      const lineHeight = headlineFontSize * HEADLINE_CONFIG.lineHeight;

      headlineLines.forEach((line, index) => {
        const textY = currentY + index * lineHeight;
        ctx.fillText(line, MARGIN, textY);
        log.debug(`Headline line ${index}: "${line}" at y=${textY}`);
      });

      currentY += headlineLines.length * lineHeight + SUBTEXT_CONFIG.gapFromHeadline;
    }

    // Draw subtext
    if (processedText.subtext) {
      ctx.fillStyle = textColor;
      ctx.font = `bold ${subtextFontSize}px PTSans-Bold`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const subtextLines = wrapText(ctx, processedText.subtext, CONTENT_WIDTH);
      const lineHeight = subtextFontSize * SUBTEXT_CONFIG.lineHeight;

      subtextLines.forEach((line, index) => {
        const textY = currentY + index * lineHeight;
        ctx.fillText(line, MARGIN, textY);
        log.debug(`Subtext line ${index}: "${line}" at y=${textY}`);
      });
    }

    // Draw arrow
    try {
      await fs.access(ARROW_SVG_PATH);
      const arrowImage = await loadImage(ARROW_SVG_PATH);

      // Tint the arrow to match the text color
      // Create a temporary canvas for the tinted arrow
      const arrowCanvas = createCanvas(ARROW_CONFIG.size, ARROW_CONFIG.size);
      const arrowCtx = arrowCanvas.getContext('2d');

      // Draw the arrow
      arrowCtx.drawImage(arrowImage, 0, 0, ARROW_CONFIG.size, ARROW_CONFIG.size);

      // Apply color overlay using globalCompositeOperation
      arrowCtx.globalCompositeOperation = 'source-in';
      arrowCtx.fillStyle = textColor;
      arrowCtx.fillRect(0, 0, ARROW_CONFIG.size, ARROW_CONFIG.size);

      // Draw tinted arrow onto main canvas
      ctx.drawImage(arrowCanvas, ARROW_CONFIG.x, ARROW_CONFIG.y);
      log.debug(`Arrow drawn at (${ARROW_CONFIG.x}, ${ARROW_CONFIG.y})`);
    } catch (error) {
      log.warn('Could not load arrow icon:', (error as Error).message);
    }

    const rawBuffer = canvas.toBuffer('image/png');
    return optimizeCanvasBuffer(rawBuffer);
  } catch (error) {
    log.error('Error in createSliderImage:', error);
    throw error;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  log.debug('Received request for slider_canvas');
  try {
    log.debug('Received request body:', req.body);

    const {
      label,
      headline,
      subtext,
      colorScheme = 'sand-tanne',
      backgroundColor,
      pillBackgroundColor,
      pillTextColor,
      textColor,
      labelFontSize,
      headlineFontSize,
      subtextFontSize,
    } = req.body as SliderRequestBody;

    // Get colors from scheme or use custom colors
    const scheme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES['sand-tanne'];

    const modParams: SliderParams = {
      backgroundColor: isValidHexColor(backgroundColor) ? backgroundColor! : scheme.background,
      pillBackgroundColor: isValidHexColor(pillBackgroundColor)
        ? pillBackgroundColor!
        : scheme.pillBackground,
      pillTextColor: isValidHexColor(pillTextColor) ? pillTextColor! : scheme.pillText,
      textColor: isValidHexColor(textColor) ? textColor! : scheme.text,
      labelFontSize: parseInt(labelFontSize || '70', 10) || 70,
      headlineFontSize: parseInt(headlineFontSize || '90', 10) || 90,
      subtextFontSize: parseInt(subtextFontSize || '50', 10) || 50,
    };

    log.debug('Parsed slider params:', modParams);

    await checkFiles();
    registerFonts();

    // Validate font sizes within acceptable ranges
    const sliderValidatedParams: SliderParams = {
      ...modParams,
      labelFontSize: Math.max(60, Math.min(80, modParams.labelFontSize)),
      headlineFontSize: Math.max(60, Math.min(120, modParams.headlineFontSize)),
      subtextFontSize: Math.max(35, Math.min(70, modParams.subtextFontSize)),
    };

    log.debug('Validated slider params:', sliderValidatedParams);

    const processedText = await processSliderText({ label, headline, subtext });
    log.debug('Processed text:', processedText);

    const generatedImageBuffer = await createSliderImage(processedText, sliderValidatedParams);

    const base64Image = bufferToBase64(generatedImageBuffer);

    log.debug('Slider image generated successfully');
    res.json({ image: base64Image });
  } catch (err) {
    const error = err as Error;
    log.error('Error in slider_canvas request:', error);
    res.status(500).json({
      error: 'Fehler beim Erstellen des Slider-Bildes: ' + error.message,
    });
  }
});

export default router;
