const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const sharp = require('sharp');

const { TESTBILD_PATH, params, SUNFLOWER_PATH } = require('./config');
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
    text: line,
    // Hier können Sie weitere Verarbeitungsschritte hinzufügen, z.B. Zeilenumbrüche, Formatierung, etc.
  }));

  return processedTextData;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function testLoadImage(filePath) {
  console.log(`Testing loadImage for ${filePath}...`);
  try {
    const image = await loadImage(filePath);
    console.log(`Successfully loaded image from ${filePath}`);
    return image;
  } catch (err) {
    console.error(`Failed to load image from ${filePath}:`, err);
    throw err;
  }
}

async function addTextToImage(uploadedImageBuffer, processedText, validatedParams) {
  console.log('Starting addTextToImage function');
  try {
    let img;
    if (uploadedImageBuffer) {
      console.log('Loading image from buffer, size:', uploadedImageBuffer.length);
      img = await loadImage(uploadedImageBuffer);
    } else {
      console.log('Loading default image');
      img = await loadImage(TESTBILD_PATH);
    }
    console.log('Image loaded successfully, dimensions:', img.width, 'x', img.height);

    await checkFiles();
    registerFonts();

    const canvas = createCanvas(params.OUTPUT_WIDTH, params.OUTPUT_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Hintergrundbild zeichnen
    const { width: canvasWidth, height: canvasHeight } = canvas;
    const imageAspectRatio = img.width / img.height;
    const canvasAspectRatio = canvasWidth / canvasHeight;

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

    console.log('Drawing background image...');
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, canvasHeight);
    console.log('Background image drawn.');

    const { balkenGruppenOffset, fontSize, colors, balkenOffset, sunflowerOffset, sunflowerPosition, credit } = validatedParams;
    ctx.font = `${fontSize}px GrueneType`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Berechne die Positionen und Dimensionen der Textbalken
    const balkenHeight = fontSize * params.BALKEN_HEIGHT_FACTOR;
    const activeTextLines = processedText.filter(line => line.text);
    const totalBalkenHeight = balkenHeight * activeTextLines.length;
    let startY = (canvasHeight - totalBalkenHeight) / 2 + 80;
    startY = Math.max(startY, 100);

    const balkenPositions = activeTextLines.map((line, index) => {
      const textWidth = ctx.measureText(line.text).width;
      const padding = fontSize * params.TEXT_PADDING_FACTOR;
      const rectWidth = Math.min(textWidth + padding * 2 + 20, canvasWidth - 20);
      const x = Math.max(10, Math.min(canvasWidth - rectWidth - 10, 
        (canvasWidth - rectWidth) / 2 + balkenOffset[index] + balkenGruppenOffset[0]));
      const y = startY + (balkenHeight * index) + balkenGruppenOffset[1];

      console.log(`Balken ${index} Berechnung:`, {
        baseX: (canvasWidth - rectWidth) / 2,
        offset: balkenOffset[index],
        gruppenOffset: balkenGruppenOffset[0],
        finalX: x
      });

      return { x, y, width: rectWidth, height: balkenHeight };
    });

    // Berechne die Dimensionen des gesamten Textblocks
    const textBlockLeft = Math.min(...balkenPositions.map(b => b.x));
    const textBlockRight = Math.max(...balkenPositions.map(b => b.x + b.width));
    const textBlockTop = balkenPositions[0].y;
    const textBlockBottom = balkenPositions[balkenPositions.length - 1].y + balkenHeight;
    const textBlockWidth = textBlockRight - textBlockLeft;
    const textBlockHeight = textBlockBottom - textBlockTop;

    console.log('Textblock Dimensionen:', {
      left: textBlockLeft,
      right: textBlockRight,
      top: textBlockTop,
      bottom: textBlockBottom,
      width: textBlockWidth,
      height: textBlockHeight
    });

    // Berechne die Größe und Position der Sonnenblume
    const baseSunflowerSize = Math.min(textBlockWidth, textBlockHeight) * params.SUNFLOWER_SIZE_FACTOR;
    const sizeFactor = Math.max(0.5, Math.min(1, fontSize / params.DEFAULT_FONT_SIZE));
    const sunflowerSize = baseSunflowerSize * sizeFactor;

    let sunflowerX, sunflowerY;
    const sunflowerOverlap = sunflowerSize * params.SUNFLOWER_OVERLAP_FACTOR;
    
    // Referenzpunkt je nach Anzahl der Balken
    const referenceY = activeTextLines.length === 2 ? 
      balkenPositions[1].y + balkenHeight - sunflowerSize * 0.6 : 
      textBlockBottom - sunflowerSize * 0.6;

    // X-Position je nach Anzahl der Balken
    const getReferenceX = (position) => {
      if (activeTextLines.length === 2) {
        const balken = balkenPositions[1];
        return position.includes('Right') ? 
          balken.x + balken.width - sunflowerSize * 0.7 : 
          balken.x - sunflowerSize * 0.3;
      }
      return position.includes('Right') ? 
        textBlockRight - sunflowerSize * 0.6 : 
        textBlockLeft - sunflowerSize * 0.4;
    };

    switch (sunflowerPosition) {
      case 'topLeft':
        sunflowerX = textBlockLeft - sunflowerSize * 0.4;
        sunflowerY = textBlockTop - sunflowerSize * 0.4;
        break;
      case 'topRight':
        sunflowerX = textBlockRight - sunflowerSize * 0.6;
        sunflowerY = textBlockTop - sunflowerSize * 0.4;
        break;
      case 'bottomLeft':
        if (activeTextLines.length === 2) {
          sunflowerX = balkenPositions[1].x - sunflowerSize * 0.3;
        } else {
          sunflowerX = textBlockLeft - sunflowerSize * 0.4;
        }
        sunflowerY = referenceY;
        break;
      case 'bottomRight':
      default:
        if (activeTextLines.length === 2) {
          sunflowerX = balkenPositions[1].x + balkenPositions[1].width - sunflowerSize * 0.5;
        } else {
          sunflowerX = textBlockRight - sunflowerSize * 0.6;
        }
        sunflowerY = referenceY;
        break;
    }

    const adjustedSunflowerX = Math.max(0, Math.min(canvasWidth - sunflowerSize, sunflowerX + sunflowerOffset[0]));
    const adjustedSunflowerY = Math.max(0, Math.min(canvasHeight - sunflowerSize, sunflowerY + sunflowerOffset[1]));

    console.log('Drawing sunflower image...');
    const sunflowerBuffer = await fs.readFile(SUNFLOWER_PATH);
    const sunflowerImage = await loadImage(sunflowerBuffer);
    ctx.drawImage(sunflowerImage, adjustedSunflowerX, adjustedSunflowerY, sunflowerSize, sunflowerSize);
    console.log('Sunflower image drawn at:', { adjustedSunflowerX, adjustedSunflowerY, sunflowerSize });

    // Zeichne die Balken
    balkenPositions.forEach((balken, index) => {
      const { x, y, width, height } = balken;
      const { background, text } = colors[index];

      const points = [
        { x: x, y: y + height },
        { x: x + width - (height * Math.tan(12 * Math.PI / 180)) / 2, y: y + height },
        { x: x + width + (height * Math.tan(12 * Math.PI / 180)) / 2, y: y },
        { x: x + (height * Math.tan(12 * Math.PI / 180)) / 2, y: y }
      ];

      ctx.fillStyle = background;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.lineTo(points[3].x, points[3].y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = text;
      const textX = x + width / 2;
      const textY = y + height / 2;
      ctx.fillText(activeTextLines[index].text, textX, textY);

      console.log(`Balken ${index} drawn at: x=${x}, y=${y}, width=${width}, height=${height}`);
    });
   
    if (credit) {
      console.log('Zeichne Credit-Text:', credit);
      ctx.font = '60px GrueneType'; // Feste Schriftgröße für Credit
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      const creditY = canvasHeight - 40; // 20px vom unteren Ran
      
      // Text zeichnen
      ctx.fillStyle = '#FFFFFF'; // Weiße Schriftfarbe für Credit
      ctx.fillText(credit, canvasWidth / 2, creditY);
      
      console.log('Credit-Text gezeichnet an Position:', { x: canvasWidth / 2, y: creditY });
    } else {
      console.log('Kein Credit-Text vorhanden, wird nicht gezeichnet');
    }

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in addTextToImage:', error);
    if (error.message.includes('Unsupported image type')) {
      console.error('Image buffer details:', uploadedImageBuffer.slice(0, 20));  // Log the first 20 bytes of the buffer
    }
    throw error;
  }
}

router.post('/', upload.single('image'), async (req, res) => {
  console.log('Received request for dreizeilen_canvas');
  try {
    if (req.file) {
      console.log('Received file details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    }

    console.log('Received request body:', req.body);

    const {
      balkenGruppe_offset_x, balkenGruppe_offset_y, fontSize,
      colors_0_background, colors_0_text,
      colors_1_background, colors_1_text,
      colors_2_background, colors_2_text,
      balkenOffset_0, balkenOffset_1, balkenOffset_2,
      line1, line2, line3,
      sunflower_offset_x, sunflower_offset_y,
      sunflowerPosition,
      credit // Neuer Credit-Parameter
    } = req.body;

    const uploadedImageBuffer = req.file ? req.file.buffer : null;

    console.log('Incoming color values:', {
      colors_0_background, colors_0_text,
      colors_1_background, colors_1_text,
      colors_2_background, colors_2_text
    });
    
    const modParams = {
      balkenGruppenOffset: [parseFloat(balkenGruppe_offset_x) || 0, parseFloat(balkenGruppe_offset_y) || 0],
      fontSize: parseInt(fontSize, 10) || params.DEFAULT_FONT_SIZE,
            colors: [
        {
          background: isValidHexColor(colors_0_background) ? colors_0_background : getDefaultColor('background', 0),
          text: isValidHexColor(colors_0_text) ? colors_0_text : getDefaultColor('text', 0)
        },
        {
          background: isValidHexColor(colors_1_background) ? colors_1_background : getDefaultColor('background', 1),
          text: isValidHexColor(colors_1_text) ? colors_1_text : getDefaultColor('text', 1)
        },
        {
          background: isValidHexColor(colors_2_background) ? colors_2_background : getDefaultColor('background', 2),
          text: isValidHexColor(colors_2_text) ? colors_2_text : getDefaultColor('text', 2)
        }
      ],
      balkenOffset: [
        balkenOffset_0 !== undefined ? parseFloat(balkenOffset_0) : params.DEFAULT_BALKEN_OFFSET[0],
        balkenOffset_1 !== undefined ? parseFloat(balkenOffset_1) : params.DEFAULT_BALKEN_OFFSET[1],
        balkenOffset_2 !== undefined ? parseFloat(balkenOffset_2) : params.DEFAULT_BALKEN_OFFSET[2]
      ],
      sunflowerOffset: [
        parseFloat(sunflower_offset_x) || 0,
        parseFloat(sunflower_offset_y) || 0
      ],
      sunflowerPosition: sunflowerPosition || params.DEFAULT_SUNFLOWER_POSITION,
      credit: credit || '' // Credit-Parameter hinzufügen

    };

    console.log('Parsed modParams:', modParams);

    await checkFiles();
    registerFonts();

    const validatedParams = validateParams(modParams);
    console.log('Validated params:', validatedParams);

    const processedText = await processText({ line1, line2, line3 });
    console.log('Processed text:', processedText);

    const imageBuffer = req.file?.buffer;
    if (!imageBuffer) {
      throw new Error('Kein Bild gefunden');
    }

    try {
      const metadata = await sharp(imageBuffer).metadata();
      console.log('Image metadata:', metadata); // Hilft bei der Diagnose

      // Stellen Sie sicher, dass wir ein gültiges Bildformat haben
      if (!metadata.format) {
        throw new Error('Bildformat konnte nicht erkannt werden');
      }

      // Verwenden Sie das verarbeitete Bild für addTextToImage
      const generatedImageBuffer = await addTextToImage(imageBuffer, processedText, validatedParams);
      const base64Image = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;

      console.log('Image generated successfully and converted to Base64');
      res.json({ image: base64Image });
    } catch (error) {
      console.error('Fehler bei der Bildverarbeitung:', error);
      res.status(400).json({ 
        error: 'Bildverarbeitungsfehler',
        details: error.message 
      });
    }

  } catch (err) {
    console.error('Fehler bei der Anfrage:', err);
    res.status(500).json({ error: 'Fehler beim Erstellen des Bildes: ' + err.message });
  }
});

module.exports = router;