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

// Path to the quotation mark SVG
const QUOTE_SVG_PATH = path.resolve(__dirname, '../../../public/quote.svg');
// Path to the sunflower SVG (watermark)
const SUNFLOWER_SVG_PATH = path.resolve(__dirname, '../../../public/sonnenblume_dunkelgruen.svg');

async function processZitatPureText(textData) {
  console.log('processZitatPureText aufgerufen mit:', textData);

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
  console.log('Starting createZitatPureImage function');
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
    console.log('Loading quotation mark SVG from:', QUOTE_SVG_PATH);
    const quotationMark = await loadImage(QUOTE_SVG_PATH);
    console.log('Quotation mark loaded successfully');

    // Load the sunflower SVG
    console.log('Loading sunflower SVG from:', SUNFLOWER_SVG_PATH);
    const sunflower = await loadImage(SUNFLOWER_SVG_PATH);
    console.log('Sunflower loaded successfully');

    // Create canvas with standard sharepic dimensions
    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');

    const { backgroundColor, textColor, quoteMarkColor, quoteFontSize, nameFontSize } = validatedParams;

    // Fill background with solid color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, 1080, 1350);
    console.log('Background filled with color:', backgroundColor);

    // Draw sunflower watermark in upper-right corner with 6% opacity
    // The sunflower bleeds off top and right edges, creating a cropped effect
    const sunflowerSize = 800; // Large size so it bleeds off edges
    const sunflowerX = 1080 - sunflowerSize + 200; // Positioned to bleed off right edge
    const sunflowerY = -200; // Positioned to bleed off top edge

    ctx.save();
    ctx.globalAlpha = 0.06; // 6% opacity for subtle watermark effect
    ctx.drawImage(sunflower, sunflowerX, sunflowerY, sunflowerSize, sunflowerSize);
    ctx.restore();
    console.log(`Sunflower watermark drawn at (${sunflowerX}, ${sunflowerY}) with size ${sunflowerSize}px and 6% opacity`);

    // Test font loading
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    const testText = "Test";
    const beforeWidth = ctx.measureText(testText).width;
    ctx.font = `italic ${quoteFontSize}px serif`; // Fallback
    const serifWidth = ctx.measureText(testText).width;
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`; // Set back
    const afterWidth = ctx.measureText(testText).width;
    
    console.log('Font loading test:', {
      grueneTypeWidth: beforeWidth,
      serifWidth: serifWidth,
      grueneTypeWidthAfter: afterWidth,
      differentFromSerif: afterWidth !== serifWidth
    });

    // Define layout constants
    const margin = 75;
    const textWidth = 1080 - (margin * 2);
    const quoteMarkSize = 100; // Reduced from 120px to match original
    
    // Position quotation marks in upper left (lower than before)
    const quoteMarkX = margin;
    const quoteMarkY = 200; // Moved down from 75px to 200px
    
    // Draw quotation marks (outline style in Tanne color)
    ctx.fillStyle = quoteMarkColor;
    ctx.drawImage(quotationMark, quoteMarkX, quoteMarkY, quoteMarkSize, quoteMarkSize);
    console.log(`Quotation marks drawn at position (${quoteMarkX}, ${quoteMarkY})`);

    // Position main quote text much lower to match original template
    let currentY = 320; // Fixed position at 320px from top, matching original

    // Render Quote Text (italic)
    console.log('Rendering quote text:', processedText.quote);
    ctx.font = `italic ${quoteFontSize}px GrueneTypeNeue`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Wrap text if necessary
    const quoteLines = wrapText(ctx, processedText.quote, textWidth);
    let finalQuoteY = currentY;
    quoteLines.forEach((line, index) => {
      const textY = currentY + (index * (quoteFontSize * 1.2));
      ctx.fillText(line, margin, textY);
      console.log(`Quote line ${index}: "${line}" at position (${margin}, ${textY})`);
      finalQuoteY = textY; // Track the Y position of the last line
    });
    
    // Calculate position for author name (relative to quote text end, not fixed bottom position)
    const nameY = finalQuoteY + quoteFontSize + 60; // 60px gap below the last quote line
    
    // Render Author Name (italic, smaller, bottom-left positioned)
    console.log('Rendering author name:', processedText.name);
    ctx.font = `italic ${nameFontSize}px GrueneTypeNeue`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left'; // LEFT-aligned for bottom left positioning
    ctx.textBaseline = 'top';
    
    ctx.fillText(processedText.name, margin, nameY); // Position at left margin, not right
    console.log(`Author name "${processedText.name}" at position (${margin}, ${nameY})`);    

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in createZitatPureImage:', error);
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
  console.log('Received request for zitat_pure_canvas');
  try {
    console.log('Received request body:', req.body);

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
      quoteFontSize: parseInt(quoteFontSize, 10) || 78, // Increased to better match original (75-80px range)
      nameFontSize: parseInt(nameFontSize, 10) || 35 // Smaller author text
    };

    console.log('Parsed zitat pure params:', modParams);

    await checkFiles();
    registerFonts();

    // Validation for font sizes
    const zitatPureValidatedParams = {
      ...modParams,
      quoteFontSize: Math.max(50, Math.min(90, modParams.quoteFontSize)),
      nameFontSize: Math.max(25, Math.min(50, modParams.nameFontSize))
    };

    console.log('Validated zitat pure params:', zitatPureValidatedParams);
    
    const processedText = await processZitatPureText({ quote, name });
    console.log('Processed text:', processedText);

    // Generate the image
    const generatedImageBuffer = await createZitatPureImage(
      processedText, 
      zitatPureValidatedParams
    );
    
    const base64Image = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;

    console.log('Zitat Pure image generated successfully');
    res.json({ image: base64Image });

  } catch (err) {
    console.error('Error in zitat_pure_canvas request:', err);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Zitat-Pure-Bildes: ' + err.message 
    });
  }
});

module.exports = router;