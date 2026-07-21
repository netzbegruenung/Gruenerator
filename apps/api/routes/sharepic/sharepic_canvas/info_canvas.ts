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

// Single sunflower overlay, bottom-right — only its top-left quadrant is visible,
// reproducing the look the baked-in flower used to have on the tanne background.
const SUNFLOWER_SIZE = 820;
const SUNFLOWER_X = CANVAS_WIDTH - 520; // 560
const SUNFLOWER_Y = CANVAS_HEIGHT - 440; // 910
// Text must stay above the flower so it is never clipped or overlapped.
const CONTENT_BOTTOM = SUNFLOWER_Y - 30; // ~880

interface ParsedBody {
  firstSentence: string;
  remainingText: string;
}

interface InfoTextData {
  header: string | undefined;
  bodyFirstSentence: string | undefined;
  bodyRemaining: string | undefined;
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
  bodyLines: WordWithFont[][];
  bodyFontSize: number;
}

interface WordWithFont {
  text: string;
  font: string;
}

interface InfoRequestBody {
  header?: string;
  body?: string;
  bodyFirstSentence?: string;
  bodyRemaining?: string;
  bgColor?: string;
  headerColor?: string;
  bodyColor?: string;
  headerFontSize?: string;
  bodyFontSize?: string;
}

function parseBodyText(bodyText: string): ParsedBody {
  if (!bodyText || typeof bodyText !== 'string') {
    return { firstSentence: '', remainingText: '' };
  }

  const sentenceEndRegex = /[.!?](?=\s+[A-Z])/;
  const match = bodyText.match(sentenceEndRegex);

  if (match && match.index !== undefined) {
    const firstSentence = bodyText.substring(0, match.index).trim();
    const remainingText = bodyText.substring(match.index + 1).trim();
    return { firstSentence, remainingText };
  }

  return { firstSentence: bodyText, remainingText: '' };
}

async function processInfoText(textData: Partial<InfoTextData>): Promise<InfoTextData> {
  const { header, bodyFirstSentence, bodyRemaining } = textData;

  if (!header && !bodyFirstSentence && !bodyRemaining) {
    throw new Error('Mindestens ein Textfeld (Header oder Body) muss angegeben werden');
  }

  return {
    header: header || '',
    bodyFirstSentence: bodyFirstSentence || '',
    bodyRemaining: bodyRemaining || '',
  };
}

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

function renderWordsWithFonts(
  ctx: CanvasRenderingContext2D,
  wordsWithFont: WordWithFont[],
  x: number,
  y: number,
  color: string
): void {
  let currentX = x;

  wordsWithFont.forEach((wordObj, index) => {
    ctx.font = wordObj.font;
    ctx.fillStyle = color;

    const wordWidth = ctx.measureText(wordObj.text).width;
    ctx.fillText(wordObj.text, currentX, y);

    if (index < wordsWithFont.length - 1) {
      const spaceWidth = ctx.measureText(' ').width;
      currentX += wordWidth + spaceWidth;
    }
  });
}

function buildWordsWithFont(
  bodyFirstSentence: string,
  bodyRemaining: string,
  bodyFontSize: number
): WordWithFont[] {
  const fullBodyText = `${bodyFirstSentence} ${bodyRemaining}`.trim();
  const allWords = fullBodyText.split(' ').filter(Boolean);
  const firstSentenceWordCount = bodyFirstSentence
    ? bodyFirstSentence.split(' ').filter(Boolean).length
    : 0;

  return allWords.map((word, index) => ({
    text: word,
    font:
      index < firstSentenceWordCount
        ? `${bodyFontSize}px PTSans-Bold`
        : `${bodyFontSize}px PTSans-Regular`,
  }));
}

function wrapWordsWithFont(
  ctx: CanvasRenderingContext2D,
  wordsWithFont: WordWithFont[],
  maxWidth: number
): WordWithFont[][] {
  const lines: WordWithFont[][] = [];
  let currentLine: WordWithFont[] = [];

  for (const wordObj of wordsWithFont) {
    const testLine = [...currentLine, wordObj];
    let testLineWidth = 0;
    testLine.forEach((w, idx) => {
      ctx.font = w.font;
      testLineWidth += ctx.measureText(w.text).width;
      if (idx < testLine.length - 1) {
        testLineWidth += ctx.measureText(' ').width;
      }
    });

    if (testLineWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [wordObj];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
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

  const words = buildWordsWithFont(
    processedText.bodyFirstSentence || '',
    processedText.bodyRemaining || '',
    bodyFontSize
  );
  const bodyLines = wrapWordsWithFont(ctx, words, BODY_TEXT_WIDTH);
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
      const lastLine = trimmed[trimmed.length - 1];
      const lastWord = lastLine[lastLine.length - 1];
      lastLine[lastLine.length - 1] = {
        ...lastWord,
        text: `${lastWord.text.replace(/[.,;:!?]+$/, '')}…`,
      };
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
    ctx.fillStyle = bodyColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let bodyY = layout.bodyStartY;
    for (const line of layout.bodyLines) {
      renderWordsWithFonts(ctx, line, BODY_TEXT_MARGIN, bodyY, bodyColor);
      bodyY += layout.bodyFontSize * BODY_LINE_HEIGHT_RATIO;
    }

    const rawBuffer = canvas.toBuffer('image/png');
    return optimizeCanvasBuffer(rawBuffer);
  } catch (error) {
    log.error('Error in createInfoImage:', error);
    throw error;
  }
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      header,
      body,
      bodyFirstSentence,
      bodyRemaining,
      bgColor,
      headerColor,
      bodyColor,
      headerFontSize,
      bodyFontSize,
    } = req.body as InfoRequestBody;

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

    let parsedBodyFirstSentence = bodyFirstSentence;
    let parsedBodyRemaining = bodyRemaining;

    if (body && !bodyFirstSentence && !bodyRemaining) {
      const parsed = parseBodyText(body);
      parsedBodyFirstSentence = parsed.firstSentence;
      parsedBodyRemaining = parsed.remainingText;
    }

    const processedText = await processInfoText({
      header,
      bodyFirstSentence: parsedBodyFirstSentence,
      bodyRemaining: parsedBodyRemaining,
    });

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
