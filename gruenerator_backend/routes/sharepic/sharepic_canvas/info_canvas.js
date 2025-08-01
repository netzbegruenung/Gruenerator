const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

const { COLORS } = require('./config');
const { isValidHexColor } = require('./utils');
const { checkFiles, registerFonts } = require('./fileManagement');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Path to the pre-made Info background
const INFO_BG_PATH = path.resolve(__dirname, '../../../public/Info_bg_tanne.png');

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
    const firstSentence = bodyText.substring(0, firstSentenceEnd).trim();
    const remainingText = bodyText.substring(firstSentenceEnd).trim();
    return { firstSentence, remainingText };
  }
  
  // If no sentence ending found, treat entire text as first sentence
  return { firstSentence: bodyText, remainingText: '' };
}

async function processInfoText(textData) {
  console.log('processInfoText aufgerufen mit:', textData);

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
  console.log('Starting createInfoImage function');
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
    console.log('Loading Info background image from:', INFO_BG_PATH);
    const backgroundImage = await loadImage(INFO_BG_PATH);
    console.log('Background image loaded successfully, dimensions:', backgroundImage.width, 'x', backgroundImage.height);

    // Create canvas with same dimensions as background
    const canvas = createCanvas(backgroundImage.width, backgroundImage.height);
    const ctx = canvas.getContext('2d');

    // Draw the background image
    ctx.drawImage(backgroundImage, 0, 0);
    console.log('Background image drawn to canvas');

    const { headerColor, bodyColor, headerFontSize, bodyFontSize } = validatedParams;

    // Test font loading
    ctx.font = `${headerFontSize}px GrueneType`;
    const testText = "Test";
    const beforeWidth = ctx.measureText(testText).width;
    ctx.font = `${headerFontSize}px serif`; // Fallback
    const serifWidth = ctx.measureText(testText).width;
    ctx.font = `${headerFontSize}px GrueneType`; // Set back
    const afterWidth = ctx.measureText(testText).width;
    
    console.log('Font loading test:', {
      grueneTypeWidth: beforeWidth,
      serifWidth: serifWidth,
      grueneTypeWidthAfter: afterWidth,
      differentFromSerif: afterWidth !== serifWidth
    });

    // Define text areas and positioning
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const margin = 50;
    const textWidth = canvasWidth - (margin * 2);

    let currentY = 190; // Start position for text (matching original template)

    // Render Header Text
    if (processedText.header) {
      console.log('Rendering header text:', processedText.header);
      ctx.font = `${headerFontSize}px GrueneType`;
      ctx.fillStyle = headerColor;
      ctx.textAlign = 'left'; // Left-aligned header
      ctx.textBaseline = 'top';
      
      // Wrap text if necessary
      const headerLines = wrapText(ctx, processedText.header, textWidth);
      headerLines.forEach((line, index) => {
        const textY = currentY + (index * (headerFontSize * 1.2));
        ctx.fillText(line, margin, textY); // Left-aligned with margin
        console.log(`Header line ${index}: "${line}" at position (${margin}, ${textY})`);
      });
      
      currentY += (headerLines.length * headerFontSize * 1.2) + 40; // Add spacing after header
    }


    // Render Body Text as continuous block with mixed fonts
    if (processedText.bodyFirstSentence || processedText.bodyRemaining) {
      console.log('Rendering body text with pre-marked word fonts');
      
      // Pre-process: mark each word with its font type
      const fullBodyText = (processedText.bodyFirstSentence + ' ' + processedText.bodyRemaining).trim();
      const allWords = fullBodyText.split(' ');
      const firstSentenceWordCount = processedText.bodyFirstSentence ? processedText.bodyFirstSentence.split(' ').length : 0;
      
      const wordsWithFont = allWords.map((word, index) => ({
        text: word,
        font: index < firstSentenceWordCount ? `${bodyFontSize}px PTSans-Bold` : `${bodyFontSize}px PTSans-Regular`
      }));
      
      console.log('Words with font assignments:', wordsWithFont.slice(0, 10)); // Log first 10 for debugging
      
      ctx.fillStyle = bodyColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      let currentX = margin;
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
        
        if (testWidth > textWidth && currentLine.length > 0) {
          // Line is full, render current line and start new one
          renderWordsWithFonts(ctx, currentLine, margin, bodyY, bodyColor);
          currentLine = [wordObj];
          bodyY += bodyFontSize * 1.4;
        } else {
          currentLine = testLine;
        }
      }
      
      // Render final line
      if (currentLine.length > 0) {
        renderWordsWithFonts(ctx, currentLine, margin, bodyY, bodyColor);
      }
    }

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in createInfoImage:', error);
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
    
    const fontType = wordObj.font.includes('Bold') ? 'Bold' : 'Regular';
    console.log(`Word "${wordObj.text}" (${fontType}) at position (${currentX - wordWidth}, ${y})`);
  });
}

router.post('/', upload.single('image'), async (req, res) => {
  console.log('Received request for info_canvas');
  try {
    console.log('Received request body:', req.body);

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

    console.log('Parsed info params:', modParams);

    await checkFiles();
    registerFonts();

    // Validation for font sizes
    const infoValidatedParams = {
      ...modParams,
      headerFontSize: Math.max(50, Math.min(120, modParams.headerFontSize)),
      bodyFontSize: Math.max(30, Math.min(60, modParams.bodyFontSize))
    };

    console.log('Validated info params:', infoValidatedParams);

    // Parse body text if provided as single field, or use separate fields if provided
    let parsedBodyFirstSentence = bodyFirstSentence;
    let parsedBodyRemaining = bodyRemaining;
    
    if (body && !bodyFirstSentence && !bodyRemaining) {
      // Parse the body text using backend logic
      const parsed = parseBodyText(body);
      parsedBodyFirstSentence = parsed.firstSentence;
      parsedBodyRemaining = parsed.remainingText;
      console.log('Parsed body in backend:', parsed);
    }
    
    const processedText = await processInfoText({ 
      header, 
      bodyFirstSentence: parsedBodyFirstSentence, 
      bodyRemaining: parsedBodyRemaining 
    });
    console.log('Processed text:', processedText);

    // Generate the image
    const generatedImageBuffer = await createInfoImage(
      processedText, 
      infoValidatedParams
    );
    
    const base64Image = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;

    console.log('Info image generated successfully');
    res.json({ image: base64Image });

  } catch (err) {
    console.error('Error in info_canvas request:', err);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Info-Bildes: ' + err.message 
    });
  }
});

module.exports = router;