import { Router, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import multer from 'multer';
import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import fs from 'fs/promises';
import path from 'path';
import { COLORS } from '../../../services/sharepic/canvas/config.js';
import { isValidHexColor } from '../../../services/sharepic/canvas/utils.js';
import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('info_canvas');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const INFO_BG_PATH = path.resolve(__dirname, '../../../public/Info_bg_tanne.png');
const ARROW_PATH = path.resolve(__dirname, '../../../public/arrow_right.svg');

interface ParsedBody {
  firstSentence: string;
  remainingText: string;
}

interface InfoTextData {
  header: string;
  bodyFirstSentence: string;
  bodyRemaining: string;
}

interface InfoParams {
  headerColor: string;
  bodyColor: string;
  headerFontSize: number;
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
    bodyRemaining: bodyRemaining || ''
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

async function createInfoImage(
  processedText: InfoTextData,
  validatedParams: InfoParams
): Promise<Buffer> {
  try {
    await checkFiles();
    registerFonts();

    try {
      await fs.access(INFO_BG_PATH);
    } catch {
      throw new Error(`Info background image not found: ${INFO_BG_PATH}`);
    }

    const backgroundImage = await loadImage(INFO_BG_PATH);

    const canvas: Canvas = createCanvas(backgroundImage.width, backgroundImage.height);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    ctx.drawImage(backgroundImage, 0, 0);

    const { headerColor, bodyColor, headerFontSize, bodyFontSize } = validatedParams;

    const canvasWidth = canvas.width;
    const margin = 50;
    const textWidth = canvasWidth - (margin * 2);

    let currentY = 190;

    if (processedText.header) {
      ctx.font = `${headerFontSize}px GrueneTypeNeue`;
      ctx.fillStyle = headerColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const headerLines = wrapText(ctx, processedText.header, textWidth);
      headerLines.forEach((line, index) => {
        const textY = currentY + (index * (headerFontSize * 1.2));
        ctx.fillText(line, margin, textY);
      });

      currentY += (headerLines.length * headerFontSize * 1.2) + 40;
    }

    const arrowSize = 60;
    const arrowX = margin;
    const arrowY = currentY;

    try {
      const arrowImage = await loadImage(ARROW_PATH);
      ctx.drawImage(arrowImage, arrowX, arrowY, arrowSize, arrowSize);
    } catch (error) {
      log.warn('Could not load arrow icon:', (error as Error).message);
    }

    const bodyTextMargin = margin + arrowSize + 15;
    const bodyTextWidth = canvasWidth - bodyTextMargin - margin;

    if (processedText.bodyFirstSentence || processedText.bodyRemaining) {
      const fullBodyText = (processedText.bodyFirstSentence + ' ' + processedText.bodyRemaining).trim();
      const allWords = fullBodyText.split(' ');
      const firstSentenceWordCount = processedText.bodyFirstSentence ? processedText.bodyFirstSentence.split(' ').length : 0;

      const wordsWithFont: WordWithFont[] = allWords.map((word, index) => ({
        text: word,
        font: index < firstSentenceWordCount ? `${bodyFontSize}px PTSans-Bold` : `${bodyFontSize}px PTSans-Regular`
      }));

      ctx.fillStyle = bodyColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let bodyY = currentY;
      let currentLine: WordWithFont[] = [];

      for (let i = 0; i < wordsWithFont.length; i++) {
        const wordObj = wordsWithFont[i];
        const testLine = [...currentLine, wordObj];

        let testLineWidth = 0;
        testLine.forEach((w, idx) => {
          ctx.font = w.font;
          testLineWidth += ctx.measureText(w.text).width;
          if (idx < testLine.length - 1) {
            testLineWidth += ctx.measureText(' ').width;
          }
        });

        if (testLineWidth > bodyTextWidth && currentLine.length > 0) {
          renderWordsWithFonts(ctx, currentLine, bodyTextMargin, bodyY, bodyColor);
          currentLine = [wordObj];
          bodyY += bodyFontSize * 1.4;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine.length > 0) {
        renderWordsWithFonts(ctx, currentLine, bodyTextMargin, bodyY, bodyColor);
      }
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
      headerColor,
      bodyColor,
      headerFontSize,
      bodyFontSize
    } = req.body as InfoRequestBody;

    const modParams: InfoParams = {
      headerColor: isValidHexColor(headerColor) ? headerColor! : '#FFFFFF',
      bodyColor: isValidHexColor(bodyColor) ? bodyColor! : '#FFFFFF',
      headerFontSize: parseInt(headerFontSize || '89', 10) || 89,
      bodyFontSize: parseInt(bodyFontSize || '40', 10) || 40
    };

    await checkFiles();
    registerFonts();

    const infoValidatedParams: InfoParams = {
      ...modParams,
      headerFontSize: Math.max(50, Math.min(120, modParams.headerFontSize)),
      bodyFontSize: Math.max(30, Math.min(60, modParams.bodyFontSize))
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
      bodyRemaining: parsedBodyRemaining
    });

    const generatedImageBuffer = await createInfoImage(
      processedText,
      infoValidatedParams
    );

    const base64Image = bufferToBase64(generatedImageBuffer);

    res.json({ image: base64Image });

  } catch (err) {
    const error = err as Error;
    log.error('Error in info_canvas request:', error);
    res.status(500).json({
      error: 'Fehler beim Erstellen des Info-Bildes: ' + error.message
    });
  }
});

export default router;
