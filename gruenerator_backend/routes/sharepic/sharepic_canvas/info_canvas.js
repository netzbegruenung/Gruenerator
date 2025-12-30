const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

const { COLORS } = require('./config');
const { isValidHexColor } = require('./utils');
const { checkFiles, registerFonts } = require('./fileManagement');
const { optimizeCanvasBuffer, bufferToBase64 } = require('./imageOptimizer');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('info_canvas');


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Path to the pre-made Info background
const INFO_BG_PATH = path.resolve(__dirname, '../../../public/Info_bg_tanne.png');
const ARROW_PATH = path.resolve(__dirname, '../../../public/arrow_right.svg');
const SUNFLOWER_PATH = path.resolve(__dirname, '../../../public/sonnenblume_dunkelgruen.svg');

// Function to parse body text into first sentence and remaining text
function parseBodyText(bodyText) {
  if (!bodyText || typeof bodyText !== 'string') {
    return { firstSentence: '', remainingText: '' };
  }

  // Better regex: find sentence endings followed by whitespace and capital letter
  const sentenceEndRegex = /[.!?](?=\s+[A-Z])/;
  const match = bodyText.match(sentenceEndRegex);
  
  if (match) {
    const firstSentenceEnd = match.index + 1; // Include the punctuation
    const firstSentence = bodyText.substring(0, match.index).trim();
    const remainingText = bodyText.substring(firstSentenceEnd).trim();
    return { firstSentence, remainingText };
  }
  
  // If no sentence ending found, treat entire text as first sentence
  return { firstSentence: bodyText, remainingText: '' };
}

async function processInfoText(textData) {
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

async function createInfoImage(processedText, validatedParams) {
  try {
    await checkFiles();
    registerFonts();

    // Check if background image exists
    try {
      await fs.access(INFO_BG_PATH);
    } catch (error) {
      throw new Error(`Info background image not found: ${INFO_BG_PATH}`);
    }

    // Load the pre-made background image
    const backgroundImage = await loadImage(INFO_BG_PATH);

    // Create canvas with same dimensions as background
    const canvas = createCanvas(backgroundImage.width, backgroundImage.height);
    const ctx = canvas.getContext('2d');

    // Draw the background image
    ctx.drawImage(backgroundImage, 0, 0);

    const { headerColor, bodyColor, headerFontSize, bodyFontSize } = validatedParams;

    // Define text areas and positioning
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const margin = 50;
    const textWidth = canvasWidth - (margin * 2);

    let currentY = 190; // Start position for text (matching original template)

    // Render Header Text
    if (processedText.header) {
      ctx.font = `${headerFontSize}px GrueneTypeNeue`;
      ctx.fillStyle = headerColor;
      ctx.textAlign = 'left'; // Left-aligned header
      ctx.textBaseline = 'top';

      // Wrap text if necessary
      const headerLines = wrapText(ctx, processedText.header, textWidth);
      headerLines.forEach((line, index) => {
        const textY = currentY + (index * (headerFontSize * 1.2));
        ctx.fillText(line, margin, textY); // Left-aligned with margin
      });
      
      currentY += (headerLines.length * headerFontSize * 1.2) + 40; // Add spacing after header
    }


    // Render Arrow Icon - aligned with header text
    let arrowSize = 60;
    let arrowX = margin; // Same alignment as header
    let arrowY = currentY; // Align with first line of body text

    try {
      const arrowImage = await loadImage(ARROW_PATH);
      ctx.drawImage(arrowImage, arrowX, arrowY, arrowSize, arrowSize);
    } catch (error) {
      log.warn('Could not load arrow icon:', error.message);
    }

    // Body text starts after the arrow
    const bodyTextMargin = margin + arrowSize + 15; // Arrow width + spacing
    const bodyTextWidth = canvasWidth - bodyTextMargin - margin; // Adjusted width

    // Render Body Text as continuous block with mixed fonts
    if (processedText.bodyFirstSentence || processedText.bodyRemaining) {
      // Pre-process: mark each word with its font type
      const fullBodyText = (processedText.bodyFirstSentence + ' ' + processedText.bodyRemaining).trim();
      const allWords = fullBodyText.split(' ');
      const firstSentenceWordCount = processedText.bodyFirstSentence ? processedText.bodyFirstSentence.split(' ').length : 0;

      const wordsWithFont = allWords.map((word, index) => ({
        text: word,
        font: index < firstSentenceWordCount ? `${bodyFontSize}px PTSans-Bold` : `${bodyFontSize}px PTSans-Regular`
      }));

      ctx.fillStyle = bodyColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let currentX = bodyTextMargin;
      let bodyY = currentY;
      let currentLine = [];
      
      for (let i = 0; i < wordsWithFont.length; i++) {
        const wordObj = wordsWithFont[i];
        const testLine = [...currentLine, wordObj];
        
        // Calculate total width of test line
        let testWidth = 0;
        testLine.forEach((w, idx) => {
          ctx.font = w.font;
          testWidth += ctx.measureText(w.text).width;
          if (idx < testLine.length - 1) {
            testWidth += ctx.measureText(' ').width; // Add space width
          }
        });
        
        if (testWidth > bodyTextWidth && currentLine.length > 0) {
          // Line is full, render current line and start new one
          renderWordsWithFonts(ctx, currentLine, bodyTextMargin, bodyY, bodyColor);
          currentLine = [wordObj];
          bodyY += bodyFontSize * 1.4;
        } else {
          currentLine = testLine;
        }
      }

      // Render final line
      if (currentLine.length > 0) {
        renderWordsWithFonts(ctx, currentLine, bodyTextMargin, bodyY, bodyColor);
      }
    }

    return canvas.toBuffer('image/png');
  } catch (error) {
    log.error('Error in createInfoImage:', error);
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

// Helper function to render words with pre-assigned fonts
function renderWordsWithFonts(ctx, wordsWithFont, x, y, color) {
  let currentX = x;
  
  wordsWithFont.forEach((wordObj, index) => {
    // Set the pre-assigned font
    ctx.font = wordObj.font;
    ctx.fillStyle = color;
    
    // Measure and draw word
    const wordWidth = ctx.measureText(wordObj.text).width;
    ctx.fillText(wordObj.text, currentX, y);
    
    // Move X position for next word (add space width if not last word)
    if (index < wordsWithFont.length - 1) {
      const spaceWidth = ctx.measureText(' ').width;
      currentX += wordWidth + spaceWidth;
    }
    
  });
}

router.post('/', upload.single('image'), async (req, res) => {
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
    } = req.body;

    // Info-specific parameters with simplified structure
    const modParams = {
      headerColor: isValidHexColor(headerColor) ? headerColor : '#FFFFFF', // White for header
      bodyColor: isValidHexColor(bodyColor) ? bodyColor : '#FFFFFF', // White for body
      headerFontSize: parseInt(headerFontSize, 10) || 89, // Large for header
      bodyFontSize: parseInt(bodyFontSize, 10) || 40 // Body text size
    };

    await checkFiles();
    registerFonts();

    // Validation for font sizes
    const infoValidatedParams = {
      ...modParams,
      headerFontSize: Math.max(50, Math.min(120, modParams.headerFontSize)),
      bodyFontSize: Math.max(30, Math.min(60, modParams.bodyFontSize))
    };

    // Parse body text if provided as single field, or use separate fields if provided
    let parsedBodyFirstSentence = bodyFirstSentence;
    let parsedBodyRemaining = bodyRemaining;

    if (body && !bodyFirstSentence && !bodyRemaining) {
      // Parse the body text using backend logic
      const parsed = parseBodyText(body);
      parsedBodyFirstSentence = parsed.firstSentence;
      parsedBodyRemaining = parsed.remainingText;
    }

    const processedText = await processInfoText({
      header,
      bodyFirstSentence: parsedBodyFirstSentence,
      bodyRemaining: parsedBodyRemaining
    });

    // Generate the image
    const generatedImageBuffer = await createInfoImage(
      processedText,
      infoValidatedParams
    );

    const base64Image = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;

    res.json({ image: base64Image });

  } catch (err) {
    log.error('Error in info_canvas request:', err);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Info-Bildes: ' + err.message 
    });
  }
});

module.exports = router;