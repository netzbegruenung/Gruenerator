import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  createCanvas,
  loadImage,
  type Canvas,
  type SKRSContext2D as CanvasRenderingContext2D,
} from '@napi-rs/canvas';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import {
  optimizeCanvasBuffer,
  bufferToBase64,
} from '../../../services/sharepic/canvas/imageOptimizer.js';
import { isValidHexColor } from '../../../services/sharepic/canvas/utils.js';
import {
  drawRichLines,
  layoutRichTextLines,
  wrapTextLines as wrapText,
  type BlockFont,
  type RichLayoutedLine,
} from '../../../services/sharepic/textLayout.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('info_canvas');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const SUNFLOWER_PATH = path.resolve(__dirname, '../../../public/sonnenblume_gruen.png');
const ARROW_PATH = path.resolve(__dirname, '../../../public/arrow_right.svg');

// Canvas + layout geometry. Kept in sync with the Studio renderer
// (packages/canvas-editor/src/utils/infoLayout.ts) so both paths draw an identical
// Info sharepic: a solid-colour background plus ONE sunflower overlay bottom-right.
// The background PNGs used to bake the flower in, which caused a duplicate once the
// Studio overlay layer was added — the flower now lives only in the overlay.
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const DEFAULT_BG_COLOR = '#005538'; // COLORS.TANNE

const MARGIN = 50;
const ARROW_SIZE = 60;
const HEADER_START_Y = 190;
const HEADER_TEXT_WIDTH = CANVAS_WIDTH - MARGIN * 2; // 980
const BODY_TEXT_MARGIN = MARGIN + ARROW_SIZE + 15; // 125
const BODY_TEXT_WIDTH = CANVAS_WIDTH - BODY_TEXT_MARGIN - MARGIN; // 905
const HEADER_LINE_HEIGHT_RATIO = 1.2;
const BODY_LINE_HEIGHT_RATIO = 1.4;
const HEADER_BOTTOM_SPACING = 40;
const BODY_FONT_FAMILY = 'PT Sans';

// Single sunflower overlay, bottom-right — only its top-left quadrant is visible,
// reproducing the look the baked-in flower used to have on the tanne background.
const SUNFLOWER_SIZE = 820;
const SUNFLOWER_X = CANVAS_WIDTH - 520; // 560
const SUNFLOWER_Y = CANVAS_HEIGHT - 440; // 910
// Text must stay above the flower so it is never clipped or overlapped.
const CONTENT_BOTTOM = SUNFLOWER_Y - 30; // ~880

interface InfoTextData {
  header: string;
  /** Markdown-lite: `**fett**`, `_kursiv_`, `• Punkt` — siehe `@gruenerator/contracts`. */
  body: string;
}

interface InfoParams {
  bgColor: string;
  headerColor: string;
  bodyColor: string;
  headerFontSize: number;
  bodyFontSize: number;
}

interface InfoLayout {
  headerLines: string[];
  headerFontSize: number;
  arrowY: number;
  bodyStartY: number;
  bodyLines: RichLayoutedLine[];
  bodyFontSize: number;
}

interface InfoRequestBody {
  header?: string;
  body?: string;
  /** Ältere Clients schicken den Text zweigeteilt; der erste Satz wurde fett gesetzt. */
  bodyFirstSentence?: string;
  bodyRemaining?: string;
  bgColor?: string;
  headerColor?: string;
  bodyColor?: string;
  headerFontSize?: string;
  bodyFontSize?: string;
}

const bodyFont = (fontSize: number): BlockFont => ({ fontFamily: BODY_FONT_FAMILY, fontSize });

/**
 * Der Body ist EIN Text mit Auszeichnung — dieselbe Form, die der Editor
 * zeigt. Früher setzte der Server den ersten Satz von sich aus fett, während
 * die Vorschau ihn regular zeigte: Export und Vorschau widersprachen sich.
 * Jetzt steht die Fettung sichtbar im Text (`**…**`), wer sie will. Die alte
 * Drahtform `bodyFirstSentence`/`bodyRemaining` (F0) bleibt lesbar und
 * ergibt exakt das bisherige Bild.
 */
function resolveBody(input: InfoRequestBody): string {
  const { body, bodyFirstSentence, bodyRemaining } = input;
  if (bodyFirstSentence || bodyRemaining) {
    const first = bodyFirstSentence?.trim() ? `**${bodyFirstSentence.trim()}**` : '';
    return `${first} ${bodyRemaining?.trim() ?? ''}`.trim();
  }
  return body?.trim() ?? '';
}

function computeInfoLayout(
  ctx: CanvasRenderingContext2D,
  processedText: InfoTextData,
  headerFontSize: number,
  bodyFontSize: number
): InfoLayout & { bodyBottom: number } {
  let currentY = HEADER_START_Y;
  let headerLines: string[] = [];

  if (processedText.header) {
    ctx.font = `${headerFontSize}px GrueneTypeNeue`;
    headerLines = wrapText(ctx, processedText.header, HEADER_TEXT_WIDTH);
    currentY +=
      headerLines.length * headerFontSize * HEADER_LINE_HEIGHT_RATIO + HEADER_BOTTOM_SPACING;
  }

  const arrowY = currentY;
  const bodyStartY = currentY;

  const bodyLines = processedText.body
    ? layoutRichTextLines(ctx, processedText.body, BODY_TEXT_WIDTH, bodyFont(bodyFontSize))
    : [];
  const bodyBottom = bodyStartY + bodyLines.length * bodyFontSize * BODY_LINE_HEIGHT_RATIO;

  return { headerLines, headerFontSize, arrowY, bodyStartY, bodyLines, bodyFontSize, bodyBottom };
}

/**
 * Shrink header/body font sizes until the text fits above the sunflower, so it is never
 * clipped or drawn under the flower. As a last resort (pathological input that will not fit
 * even at the minimum font size) trailing body lines are dropped with an ellipsis.
 */
function fitInfoLayout(
  ctx: CanvasRenderingContext2D,
  processedText: InfoTextData,
  params: InfoParams
): InfoLayout {
  let headerFontSize = params.headerFontSize;
  let bodyFontSize = params.bodyFontSize;
  let layout = computeInfoLayout(ctx, processedText, headerFontSize, bodyFontSize);

  // Shrink the body first (2px steps), then the header (4px steps).
  while (layout.bodyBottom > CONTENT_BOTTOM && bodyFontSize > 30) {
    bodyFontSize = Math.max(30, bodyFontSize - 2);
    layout = computeInfoLayout(ctx, processedText, headerFontSize, bodyFontSize);
  }
  while (layout.bodyBottom > CONTENT_BOTTOM && headerFontSize > 50) {
    headerFontSize = Math.max(50, headerFontSize - 4);
    layout = computeInfoLayout(ctx, processedText, headerFontSize, bodyFontSize);
  }

  // Safety net: still overflowing at minimum sizes → drop trailing lines + ellipsis.
  if (layout.bodyBottom > CONTENT_BOTTOM && layout.bodyLines.length > 0) {
    const maxLines = Math.max(
      1,
      Math.floor((CONTENT_BOTTOM - layout.bodyStartY) / (bodyFontSize * BODY_LINE_HEIGHT_RATIO))
    );
    if (layout.bodyLines.length > maxLines) {
      const trimmed = layout.bodyLines.slice(0, maxLines);
      const lastLine = trimmed[trimmed.length - 1]!;
      const lastRun = lastLine.runs[lastLine.runs.length - 1];
      if (lastRun) {
        lastRun.text = `${lastRun.text.replace(/[.,;:!?\s]+$/, '')}…`;
      }
      layout = { ...layout, bodyLines: trimmed };
    }
  }

  return {
    headerLines: layout.headerLines,
    headerFontSize,
    arrowY: layout.arrowY,
    bodyStartY: layout.bodyStartY,
    bodyLines: layout.bodyLines,
    bodyFontSize,
  };
}

async function createInfoImage(
  processedText: InfoTextData,
  validatedParams: InfoParams
): Promise<Buffer> {
  try {
    await checkFiles();
    registerFonts();

    const { bgColor, headerColor, bodyColor } = validatedParams;

    const canvas: Canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    // Solid background — the flower is no longer baked in.
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Single sunflower overlay, drawn behind the text.
    try {
      const sunflowerImage = await loadImage(SUNFLOWER_PATH);
      ctx.drawImage(sunflowerImage, SUNFLOWER_X, SUNFLOWER_Y, SUNFLOWER_SIZE, SUNFLOWER_SIZE);
    } catch (error) {
      log.warn('Could not load sunflower icon:', (error as Error).message);
    }

    const layout = fitInfoLayout(ctx, processedText, validatedParams);

    // Header
    if (processedText.header) {
      ctx.font = `${layout.headerFontSize}px GrueneTypeNeue`;
      ctx.fillStyle = headerColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      layout.headerLines.forEach((line, index) => {
        const textY = HEADER_START_Y + index * layout.headerFontSize * HEADER_LINE_HEIGHT_RATIO;
        ctx.fillText(line, MARGIN, textY);
      });
    }

    // Arrow separator
    try {
      const arrowImage = await loadImage(ARROW_PATH);
      ctx.drawImage(arrowImage, MARGIN, layout.arrowY, ARROW_SIZE, ARROW_SIZE);
    } catch (error) {
      log.warn('Could not load arrow icon:', (error as Error).message);
    }

    // Body
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawRichLines(ctx, layout.bodyLines, {
      x: BODY_TEXT_MARGIN,
      y: layout.bodyStartY,
      lineHeight: layout.bodyFontSize * BODY_LINE_HEIGHT_RATIO,
      font: bodyFont(layout.bodyFontSize),
      color: bodyColor,
    });

    const rawBuffer = canvas.toBuffer('image/png');
    return optimizeCanvasBuffer(rawBuffer);
  } catch (error) {
    log.error('Error in createInfoImage:', error);
    throw error;
  }
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const input = req.body as InfoRequestBody;
    const { header, bgColor, headerColor, bodyColor, headerFontSize, bodyFontSize } = input;

    const modParams: InfoParams = {
      bgColor: isValidHexColor(bgColor) ? bgColor! : DEFAULT_BG_COLOR,
      headerColor: isValidHexColor(headerColor) ? headerColor! : '#FFFFFF',
      bodyColor: isValidHexColor(bodyColor) ? bodyColor! : '#FFFFFF',
      headerFontSize: parseInt(headerFontSize || '89', 10) || 89,
      bodyFontSize: parseInt(bodyFontSize || '40', 10) || 40,
    };

    await checkFiles();
    registerFonts();

    const infoValidatedParams: InfoParams = {
      ...modParams,
      headerFontSize: Math.max(50, Math.min(120, modParams.headerFontSize)),
      bodyFontSize: Math.max(30, Math.min(60, modParams.bodyFontSize)),
    };

    const processedText: InfoTextData = {
      header: header?.trim() ?? '',
      body: resolveBody(input),
    };
    if (!processedText.header && !processedText.body) {
      throw new Error('Mindestens ein Textfeld (Header oder Body) muss angegeben werden');
    }

    const generatedImageBuffer = await createInfoImage(processedText, infoValidatedParams);

    const base64Image = bufferToBase64(generatedImageBuffer);

    res.json({ image: base64Image });
  } catch (err) {
    const error = err as Error;
    log.error('Error in info_canvas request:', error);
    res.status(500).json({
      error: 'Fehler beim Erstellen des Info-Bildes: ' + error.message,
    });
  }
});

export default router;
