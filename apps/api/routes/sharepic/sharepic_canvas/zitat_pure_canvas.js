import express from 'express';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import multer from 'multer';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';

import { COLORS } from '../../../services/sharepic/canvas/config.js';
import { isValidHexColor } from '../../../services/sharepic/canvas/utils.js';
import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';
const log = createLogger('zitat_pure_canv');


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Path to the quotation mark SVG
const QUOTE_SVG_PATH = path.resolve(__dirname, '../../../public/quote.svg');
// Path to the sunflower SVG (watermark)
const SUNFLOWER_SVG_PATH = path.resolve(__dirname, '../../../public/sonnenblume_dunkelgruen.svg');

async function processZitatPureText(textData) {
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

async function createZitatPureImage(processedText, validatedParams) {
  log.debug('Starting createZitatPureImage function');
  try {
    await checkFiles();
    registerFonts();

    // Check if quotation mark SVG exists
    try {
      await fs.access(QUOTE_SVG_PATH);
    } catch (error) {
      throw new Error(`Anführungszeichen-SVG nicht gefunden: ${QUOTE_SVG_PATH}`);
    }

    // Check if sunflower SVG exists
    try {
      await fs.access(SUNFLOWER_SVG_PATH);
    } catch (error) {
      throw new Error(`Sonnenblumen-SVG nicht gefunden: ${SUNFLOWER_SVG_PATH}`);
    }

    // Load the quotation mark SVG
    log.debug('Loading quotation mark SVG from:', QUOTE_SVG_PATH);
    const quotationMark = await loadImage(QUOTE_SVG_PATH);
    log.debug('Quotation mark loaded successfully');

    // Load the sunflower SVG
    log.debug('Loading sunflower SVG from:', SUNFLOWER_SVG_PATH);
    const sunflower = await loadImage(SUNFLOWER_SVG_PATH);
    log.debug('Sunflower loaded successfully');

    // Create canvas with standard sharepic dimensions
    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');

    const { backgroundColor, textColor, quoteMarkColor, quoteFontSize, nameFontSize } = validatedParams;

    // Fill background with solid color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, 1080, 1350);
    log.debug('Background filled with color:', backgroundColor);

    // Draw sunflower watermark in upper-right corner with 6% opacity
    // The sunflower bleeds off top and right edges, creating a cropped effect
    const sunflowerSize = 800; // Large size so it bleeds off edges
    const sunflowerX = 1080 - sunflowerSize + 200; // Positioned to bleed off right edge
    const sunflowerY = -200; // Positioned to bleed off top edge

    ctx.save();
    ctx.globalAlpha = 0.06; // 6% opacity for subtle watermark effect
    ctx.drawImage(sunflower, sunflowerX, sunflowerY, sunflowerSize, sunflowerSize);
    ctx.restore();
    log.debug(`Sunflower watermark drawn at (${sunflowerX}, ${sunflowerY}) with size ${sunflowerSize}px and 6% opacity`);

    // Test font loading
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    const testText = "Test";
    const beforeWidth = ctx.measureText(testText).width;
    ctx.font = `italic ${quoteFontSize}px serif`; // Fallback
    const serifWidth = ctx.measureText(testText).width;
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`; // Set back
    const afterWidth = ctx.measureText(testText).width;
    
    log.debug('Font loading test:', {
      grueneTypeWidth: beforeWidth,
      serifWidth: serifWidth,
      grueneTypeWidthAfter: afterWidth,
      differentFromSerif: afterWidth !== serifWidth
    });

    // Define layout constants
    const margin = 75;
    const textWidth = 1080 - (margin * 2);
    const quoteMarkSize = 100;
    const quoteMarkX = margin;
    const gapBetweenQuoteMarkAndText = 20;
    const gapBetweenQuoteAndName = 60;

    // Set font for initial line count calculation
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Calculate initial line count to determine if we need larger font
    const initialQuoteLines = wrapText(ctx, processedText.quote, textWidth);

    // Scale up font size for short quotes (5 lines or fewer)
    let adjustedQuoteFontSize = quoteFontSize;
    let adjustedNameFontSize = nameFontSize;
    if (initialQuoteLines.length <= 5) {
      adjustedQuoteFontSize = Math.min(Math.round(quoteFontSize * 1.2), 97);
      adjustedNameFontSize = Math.min(Math.round(nameFontSize * 1.2), 42);
      ctx.font = `italic ${adjustedQuoteFontSize}px GrueneTypeNeue`;
    }

    // Recalculate with final font size
    const quoteLines = wrapText(ctx, processedText.quote, textWidth);
    const lineHeight = adjustedQuoteFontSize * 1.2;
    const quoteTextHeight = quoteLines.length * lineHeight;
    const totalContentHeight = quoteMarkSize + gapBetweenQuoteMarkAndText + quoteTextHeight + gapBetweenQuoteAndName + adjustedNameFontSize;

    // Define vertical boundaries
    const topBoundary = 120;
    const bottomBoundary = 1350 - 100;
    const availableHeight = bottomBoundary - topBoundary;

    // Center content vertically
    const contentStartY = topBoundary + (availableHeight - totalContentHeight) / 2;

    // Position elements based on centered content
    const quoteMarkY = contentStartY;
    const quoteTextY = quoteMarkY + quoteMarkSize + gapBetweenQuoteMarkAndText;

    // Draw quotation marks
    ctx.fillStyle = quoteMarkColor;
    ctx.drawImage(quotationMark, quoteMarkX, quoteMarkY, quoteMarkSize, quoteMarkSize);
    log.debug(`Quotation marks drawn at position (${quoteMarkX}, ${quoteMarkY})`);

    // Render Quote Text (italic)
    log.debug('Rendering quote text:', processedText.quote);
    ctx.fillStyle = textColor;

    let finalQuoteY = quoteTextY;
    quoteLines.forEach((line, index) => {
      const textY = quoteTextY + (index * lineHeight);
      ctx.fillText(line, margin, textY);
      log.debug(`Quote line ${index}: "${line}" at position (${margin}, ${textY})`);
      finalQuoteY = textY;
    });

    // Calculate position for author name
    const nameY = finalQuoteY + adjustedQuoteFontSize + gapBetweenQuoteAndName;

    // Render Author Name (italic, smaller, bottom-left positioned)
    log.debug('Rendering author name:', processedText.name);
    ctx.font = `italic ${adjustedNameFontSize}px GrueneTypeNeue`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left'; // LEFT-aligned for bottom left positioning
    ctx.textBaseline = 'top';
    
    ctx.fillText(processedText.name, margin, nameY); // Position at left margin, not right
    log.debug(`Author name "${processedText.name}" at position (${margin}, ${nameY})`);    

    const rawBuffer = canvas.toBuffer('image/png');
    return optimizeCanvasBuffer(rawBuffer);
  } catch (error) {
    log.error('Error in createZitatPureImage:', error);
    throw error;
  }
}

// Text wrapping utility function
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
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

router.post('/', upload.single('image'), async (req, res) => {
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
    } = req.body;

    // Zitat Pure specific parameters
    const modParams = {
      backgroundColor: isValidHexColor(backgroundColor) ? backgroundColor : COLORS.ZITAT_BG, // Default to new zitat background
      textColor: isValidHexColor(textColor) ? textColor : '#005437', // Tanne color for text
      quoteMarkColor: isValidHexColor(quoteMarkColor) ? quoteMarkColor : '#005437', // Tanne color for quote marks
      quoteFontSize: parseInt(quoteFontSize, 10) || 81, // Match original template size
      nameFontSize: parseInt(nameFontSize, 10) || 35 // Smaller author text
    };

    log.debug('Parsed zitat pure params:', modParams);

    await checkFiles();
    registerFonts();

    // Validation for font sizes
    const zitatPureValidatedParams = {
      ...modParams,
      quoteFontSize: Math.max(50, Math.min(90, modParams.quoteFontSize)),
      nameFontSize: Math.max(25, Math.min(50, modParams.nameFontSize))
    };

    log.debug('Validated zitat pure params:', zitatPureValidatedParams);
    
    const processedText = await processZitatPureText({ quote, name });
    log.debug('Processed text:', processedText);

    // Generate the image
    const generatedImageBuffer = await createZitatPureImage(
      processedText, 
      zitatPureValidatedParams
    );
    
    const base64Image = bufferToBase64(generatedImageBuffer);

    log.debug('Zitat Pure image generated successfully');
    res.json({ image: base64Image });

  } catch (err) {
    log.error('Error in zitat_pure_canvas request:', err);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Zitat-Pure-Bildes: ' + err.message 
    });
  }
});

export default router;