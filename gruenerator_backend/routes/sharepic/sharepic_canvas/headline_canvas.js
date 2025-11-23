const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;

const { TESTBILD_PATH, params, SUNFLOWER_PATH, COLORS } = require('./config');
const { isValidHexColor, getDefaultColor } = require('./utils');
const { checkFiles, registerFonts } = require('./fileManagement');
const { validateParams } = require('./paramValidation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function processText(textData) {
  console.log('processText aufgerufen mit:', textData);

  const { line1, line2, line3 } = textData;

  if (!line1 && !line2 && !line3) {
    throw new Error('Mindestens eine Textzeile muss angegeben werden');
  }

  const processedTextData = [line1, line2, line3].map((line, index) => ({
    text: line || '',
    // Validation: each line should be 6-12 characters for headline format
    isValid: line ? line.length >= 6 && line.length <= 12 : true
  }));

  return processedTextData;
}

async function createHeadlineImage(uploadedImageBuffer, processedText, validatedParams) {
  console.log('Starting createHeadlineImage function');
  try {
    await checkFiles();
    registerFonts();

    const canvas = createCanvas(params.OUTPUT_WIDTH, params.OUTPUT_HEIGHT);
    const ctx = canvas.getContext('2d');

    const { fontSize, textColor, backgroundColor, verticalOffset, credit, useBackgroundImage } = validatedParams;

    // Background rendering
    if (useBackgroundImage && uploadedImageBuffer) {
      // If background image is provided, use it with overlay
      console.log('Loading background image from buffer, size:', uploadedImageBuffer.length);
      const img = await loadImage(uploadedImageBuffer);
      console.log('Background image loaded successfully, dimensions:', img.width, 'x', img.height);

      // Scale and center background image
      const imageAspectRatio = img.width / img.height;
      const canvasAspectRatio = params.OUTPUT_WIDTH / params.OUTPUT_HEIGHT;

      let sx, sy, sWidth, sHeight;
      if (imageAspectRatio > canvasAspectRatio) {
        sHeight = img.height;
        sWidth = img.height * canvasAspectRatio;
        sx = (img.width - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = img.width;
        sHeight = img.width / canvasAspectRatio;
        sx = 0;
        sy = (img.height - sHeight) / 2;
      }

      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, params.OUTPUT_WIDTH, params.OUTPUT_HEIGHT);

      // Add semi-transparent overlay to ensure text readability
      ctx.fillStyle = backgroundColor + 'CC'; // Add transparency
      ctx.fillRect(0, 0, params.OUTPUT_WIDTH, params.OUTPUT_HEIGHT);
    } else {
      // Solid background color
      console.log('Using solid background color:', backgroundColor);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, params.OUTPUT_WIDTH, params.OUTPUT_HEIGHT);
    }

    // Add decorative sunflower silhouettes in background
    try {
      const sunflowerBuffer = await fs.readFile(SUNFLOWER_PATH);
      const sunflowerImage = await loadImage(sunflowerBuffer);
      
      // Add multiple sunflowers as background decoration with low opacity
      ctx.globalAlpha = 0.1; // Very subtle
      
      // Large sunflower top right
      const sunflower1Size = 400;
      ctx.drawImage(sunflowerImage, params.OUTPUT_WIDTH - sunflower1Size + 100, -100, sunflower1Size, sunflower1Size);
      
      // Medium sunflower bottom left
      const sunflower2Size = 300;
      ctx.drawImage(sunflowerImage, -100, params.OUTPUT_HEIGHT - sunflower2Size + 50, sunflower2Size, sunflower2Size);
      
      // Small sunflower top left
      const sunflower3Size = 200;
      ctx.drawImage(sunflowerImage, -50, 100, sunflower3Size, sunflower3Size);
      
      ctx.globalAlpha = 1.0; // Reset opacity
      console.log('Decorative sunflowers added to background');
    } catch (error) {
      console.warn('Could not add decorative sunflowers:', error.message);
    }

    // Text rendering
    const activeTextLines = processedText.filter(line => line.text);
    
    if (activeTextLines.length === 0) {
      throw new Error('Keine gültigen Textzeilen gefunden');
    }

    console.log('Setting up text rendering with font size:', fontSize);
    ctx.font = `${fontSize}px GrueneTypeNeue`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Test font loading
    const testText = "Test";
    const beforeWidth = ctx.measureText(testText).width;
    ctx.font = `${fontSize}px serif`; // Fallback
    const serifWidth = ctx.measureText(testText).width;
    ctx.font = `${fontSize}px GrueneTypeNeue`; // Set back
    const afterWidth = ctx.measureText(testText).width;
    
    console.log('Font loading test:', {
      grueneTypeWidth: beforeWidth,
      serifWidth: serifWidth,
      grueneTypeWidthAfter: afterWidth,
      differentFromSerif: afterWidth !== serifWidth
    });

    // Calculate text positioning
    const lineSpacing = fontSize * 1.0; // Tight spacing, exactly 1.0 line height
    const totalTextHeight = lineSpacing * (activeTextLines.length - 1);
    const centerY = (params.OUTPUT_HEIGHT / 2) + verticalOffset;
    let startY = centerY - (totalTextHeight / 2);

    console.log('Text positioning:', {
      centerY,
      startY,
      totalTextHeight,
      lineSpacing,
      activeLines: activeTextLines.length
    });

    // Draw each text line
    activeTextLines.forEach((line, index) => {
      const textY = startY + (index * lineSpacing);
      const textX = params.OUTPUT_WIDTH / 2;
      
      console.log(`Drawing line ${index}: "${line.text}" at position (${textX}, ${textY})`);
      ctx.fillText(line.text, textX, textY);
      
      // Validation warning for character count
      if (!line.isValid) {
        console.warn(`Line ${index + 1} has ${line.text.length} characters, recommended 6-12 characters`);
      }
    });

    // Credit text at bottom
    if (credit) {
      console.log('Adding credit text:', credit);
      ctx.font = '60px GrueneTypeNeue';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      const creditY = params.OUTPUT_HEIGHT - 40;
      ctx.fillText(credit, params.OUTPUT_WIDTH / 2, creditY);
      console.log('Credit text added at position:', { x: params.OUTPUT_WIDTH / 2, y: creditY });
    }

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in createHeadlineImage:', error);
    throw error;
  }
}

router.post('/', upload.single('image'), async (req, res) => {
  console.log('Received request for headline_canvas');
  try {
    console.log('Received request body:', req.body);

    const {
      line1, line2, line3,
      fontSize,
      textColor,
      backgroundColor,
      verticalOffset,
      credit,
      useBackgroundImage
    } = req.body;

    const uploadedImageBuffer = req.file ? req.file.buffer : null;

    // Headline-specific parameters with adjusted font size
    const modParams = {
      fontSize: parseInt(fontSize, 10) || 180, // Reduced from 240px for better readability
      textColor: isValidHexColor(textColor) ? textColor : '#005437', // Corrected Tanne color
      backgroundColor: isValidHexColor(backgroundColor) ? backgroundColor : COLORS.SAND,
      verticalOffset: parseFloat(verticalOffset) || 0,
      credit: credit || '',
      useBackgroundImage: useBackgroundImage === 'true' || false
    };

    console.log('Parsed headline params:', modParams);

    await checkFiles();
    registerFonts();

    // Simplified validation for headline format
    const headlineValidatedParams = {
      ...modParams,
      // Ensure font size is within reasonable bounds for headlines
      fontSize: Math.max(120, Math.min(250, modParams.fontSize)),
      // Ensure vertical offset is reasonable
      verticalOffset: Math.max(-300, Math.min(300, modParams.verticalOffset))
    };

    console.log('Validated headline params:', headlineValidatedParams);

    const processedText = await processText({ line1, line2, line3 });
    console.log('Processed text:', processedText);

    // Generate the image
    const generatedImageBuffer = await createHeadlineImage(
      uploadedImageBuffer, 
      processedText, 
      headlineValidatedParams
    );
    
    const base64Image = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;

    console.log('Headline image generated successfully');
    res.json({ image: base64Image });

  } catch (err) {
    console.error('Error in headline_canvas request:', err);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Headline-Bildes: ' + err.message 
    });
  }
});

module.exports = router;