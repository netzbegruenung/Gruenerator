import { Router, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import multer from 'multer';
import { createCanvas, loadImage, type Canvas, type SKRSContext2D as CanvasRenderingContext2D } from '@napi-rs/canvas';
import fs from 'fs/promises';
import path from 'path';
import { COLORS } from '../../../services/sharepic/canvas/config.js';
import { isValidHexColor } from '../../../services/sharepic/canvas/utils.js';
import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('zitat_pure_canv');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const QUOTE_SVG_PATH = path.resolve(__dirname, '../../../public/quote.svg');
const SUNFLOWER_SVG_PATH = path.resolve(__dirname, '../../../public/sonnenblume_dunkelgruen.svg');

interface ZitatPureTextData {
  quote: string;
  name: string;
}

interface ZitatPureParams {
  backgroundColor: string;
  textColor: string;
  quoteMarkColor: string;
  quoteFontSize: number;
  nameFontSize: number;
}

interface ZitatPureRequestBody {
  quote: string;
  name: string;
  backgroundColor?: string;
  textColor?: string;
  quoteMarkColor?: string;
  quoteFontSize?: string;
  nameFontSize?: string;
}

async function processZitatPureText(textData: ZitatPureTextData): Promise<ZitatPureTextData> {
  log.debug('processZitatPureText aufgerufen mit:', textData);

  const { quote, name } = textData;

  if (!quote || !name) {
    throw new Error('Sowohl Zitat als auch Name sind erforderlich');
  }

  return {
    quote: quote.trim(),
    name: name.trim()
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

async function createZitatPureImage(
  processedText: ZitatPureTextData,
  validatedParams: ZitatPureParams
): Promise<Buffer> {
  log.debug('Starting createZitatPureImage function');
  try {
    await checkFiles();
    registerFonts();

    try {
      await fs.access(QUOTE_SVG_PATH);
    } catch {
      throw new Error(`Anführungszeichen-SVG nicht gefunden: ${QUOTE_SVG_PATH}`);
    }

    try {
      await fs.access(SUNFLOWER_SVG_PATH);
    } catch {
      throw new Error(`Sonnenblumen-SVG nicht gefunden: ${SUNFLOWER_SVG_PATH}`);
    }

    log.debug('Loading quotation mark SVG from:', QUOTE_SVG_PATH);
    const quotationMark = await loadImage(QUOTE_SVG_PATH);
    log.debug('Quotation mark loaded successfully');

    log.debug('Loading sunflower SVG from:', SUNFLOWER_SVG_PATH);
    const sunflower = await loadImage(SUNFLOWER_SVG_PATH);
    log.debug('Sunflower loaded successfully');

    const canvas: Canvas = createCanvas(1080, 1350);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    const { backgroundColor, textColor, quoteMarkColor, quoteFontSize, nameFontSize } = validatedParams;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, 1080, 1350);
    log.debug('Background filled with color:', backgroundColor);

    const sunflowerSize = 800;
    const sunflowerX = 1080 - sunflowerSize + 200;
    const sunflowerY = -200;

    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.drawImage(sunflower, sunflowerX, sunflowerY, sunflowerSize, sunflowerSize);
    ctx.restore();
    log.debug(`Sunflower watermark drawn at (${sunflowerX}, ${sunflowerY}) with size ${sunflowerSize}px and 6% opacity`);

    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    const testText = "Test";
    const beforeWidth = ctx.measureText(testText).width;
    ctx.font = `italic ${quoteFontSize}px serif`;
    const serifWidth = ctx.measureText(testText).width;
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    const afterWidth = ctx.measureText(testText).width;

    log.debug('Font loading test:', {
      grueneTypeWidth: beforeWidth,
      serifWidth: serifWidth,
      grueneTypeWidthAfter: afterWidth,
      differentFromSerif: afterWidth !== serifWidth
    });

    const margin = 75;
    const textWidth = 1080 - (margin * 2);
    const quoteMarkSize = 100;
    const quoteMarkX = margin;
    const gapBetweenQuoteMarkAndText = 20;
    const gapBetweenQuoteAndName = 60;

    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const initialQuoteLines = wrapText(ctx, processedText.quote, textWidth);

    let adjustedQuoteFontSize = quoteFontSize;
    let adjustedNameFontSize = nameFontSize;
    if (initialQuoteLines.length <= 5) {
      adjustedQuoteFontSize = Math.min(Math.round(quoteFontSize * 1.2), 97);
      adjustedNameFontSize = Math.min(Math.round(nameFontSize * 1.2), 42);
      ctx.font = `italic ${adjustedQuoteFontSize}px GrueneTypeNeue`;
    }

    const quoteLines = wrapText(ctx, processedText.quote, textWidth);
    const lineHeight = adjustedQuoteFontSize * 1.2;
    const quoteTextHeight = quoteLines.length * lineHeight;
    const totalContentHeight = quoteMarkSize + gapBetweenQuoteMarkAndText + quoteTextHeight + gapBetweenQuoteAndName + adjustedNameFontSize;

    const topBoundary = 120;
    const bottomBoundary = 1350 - 100;
    const availableHeight = bottomBoundary - topBoundary;

    const contentStartY = topBoundary + (availableHeight - totalContentHeight) / 2;

    const quoteMarkY = contentStartY;
    const quoteTextY = quoteMarkY + quoteMarkSize + gapBetweenQuoteMarkAndText;

    ctx.fillStyle = quoteMarkColor;
    ctx.drawImage(quotationMark, quoteMarkX, quoteMarkY, quoteMarkSize, quoteMarkSize);
    log.debug(`Quotation marks drawn at position (${quoteMarkX}, ${quoteMarkY})`);

    log.debug('Rendering quote text:', processedText.quote);
    ctx.fillStyle = textColor;

    let finalQuoteY = quoteTextY;
    quoteLines.forEach((line, index) => {
      const textY = quoteTextY + (index * lineHeight);
      ctx.fillText(line, margin, textY);
      log.debug(`Quote line ${index}: "${line}" at position (${margin}, ${textY})`);
      finalQuoteY = textY;
    });

    const nameY = finalQuoteY + adjustedQuoteFontSize + gapBetweenQuoteAndName;

    log.debug('Rendering author name:', processedText.name);
    ctx.font = `italic ${adjustedNameFontSize}px GrueneTypeNeue`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillText(processedText.name, margin, nameY);
    log.debug(`Author name "${processedText.name}" at position (${margin}, ${nameY})`);

    const rawBuffer = canvas.toBuffer('image/png');
    return optimizeCanvasBuffer(rawBuffer);
  } catch (error) {
    log.error('Error in createZitatPureImage:', error);
    throw error;
  }
}

router.post('/', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  log.debug('Received request for zitat_pure_canvas');
  try {
    log.debug('Received request body:', req.body);

    const {
      quote,
      name,
      backgroundColor,
      textColor,
      quoteMarkColor,
      quoteFontSize,
      nameFontSize
    } = req.body as ZitatPureRequestBody;

    const modParams: ZitatPureParams = {
      backgroundColor: isValidHexColor(backgroundColor) ? backgroundColor! : COLORS.ZITAT_BG,
      textColor: isValidHexColor(textColor) ? textColor! : '#005437',
      quoteMarkColor: isValidHexColor(quoteMarkColor) ? quoteMarkColor! : '#005437',
      quoteFontSize: parseInt(quoteFontSize || '81', 10) || 81,
      nameFontSize: parseInt(nameFontSize || '35', 10) || 35
    };

    log.debug('Parsed zitat pure params:', modParams);

    await checkFiles();
    registerFonts();

    const zitatPureValidatedParams: ZitatPureParams = {
      ...modParams,
      quoteFontSize: Math.max(50, Math.min(90, modParams.quoteFontSize)),
      nameFontSize: Math.max(25, Math.min(50, modParams.nameFontSize))
    };

    log.debug('Validated zitat pure params:', zitatPureValidatedParams);

    const processedText = await processZitatPureText({ quote, name });
    log.debug('Processed text:', processedText);

    const generatedImageBuffer = await createZitatPureImage(
      processedText,
      zitatPureValidatedParams
    );

    const base64Image = bufferToBase64(generatedImageBuffer);

    log.debug('Zitat Pure image generated successfully');
    res.json({ image: base64Image });

  } catch (err) {
    const error = err as Error;
    log.error('Error in zitat_pure_canvas request:', error);
    res.status(500).json({
      error: 'Fehler beim Erstellen des Zitat-Pure-Bildes: ' + error.message
    });
  }
});

export default router;
