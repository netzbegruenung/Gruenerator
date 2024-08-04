const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;

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

async function addTextToImage(imageBuffer, textLines, modParams) {
  console.log('addTextToImage aufgerufen mit Buffer der Größe:', imageBuffer ? imageBuffer.length : 'kein Buffer');

  try {
    await checkFiles();
    registerFonts();

    let image;
    if (imageBuffer) {
      console.log('Lade hochgeladenes Bild aus Buffer');
      image = await loadImage(Buffer.from(imageBuffer));
    } else {
      console.log('Kein Bild-Buffer vorhanden, lade Standard-Testbild');
      const testbildBuffer = await fs.readFile(TESTBILD_PATH);
      image = await loadImage(testbildBuffer);
    }
    console.log('Hauptbild geladen. Dimensionen:', { width: image.width, height: image.height });

    console.log('Lade Sonnenblumenbild...');
    const sunflowerBuffer = await fs.readFile(SUNFLOWER_PATH);
    const sunflowerImage = await loadImage(sunflowerBuffer);
    console.log('Sonnenblumenbild geladen');

    const canvas = createCanvas(params.OUTPUT_WIDTH, params.OUTPUT_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Hintergrundbild zeichnen
    const { width: canvasWidth, height: canvasHeight } = canvas;
    const imageAspectRatio = image.width / image.height;
    const canvasAspectRatio = canvasWidth / canvasHeight;

    let sx, sy, sWidth, sHeight;
    if (imageAspectRatio > canvasAspectRatio) {
      sHeight = image.height;
      sWidth = image.height * canvasAspectRatio;
      sx = (image.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = image.width;
      sHeight = image.width / canvasAspectRatio;
      sx = 0;
      sy = (image.height - sHeight) / 2;
    }

    console.log('Drawing background image...');
    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, canvasHeight);
    console.log('Background image drawn.');

    const { balkenGruppenOffset, fontSize, colors, balkenOffset, sunflowerOffset, sunflowerPosition } = modParams;
    ctx.font = `${fontSize}px GrueneType`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Berechne die Positionen und Dimensionen der Textbalken
    const balkenHeight = fontSize * params.BALKEN_HEIGHT_FACTOR;
    const totalBalkenHeight = balkenHeight * textLines.length;
    let startY = (canvasHeight - totalBalkenHeight) / 2 + 80; // Erhöhter Offset nach unten
    startY = Math.max(startY, 100);

    const balkenPositions = textLines.map((line, index) => {
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
        sunflowerX = textBlockLeft - sunflowerSize * 0.4;
        sunflowerY = textBlockBottom - sunflowerSize * 0.6;
        break;
      case 'bottomRight':
      default:
        sunflowerX = textBlockRight - sunflowerSize * 0.6;
        sunflowerY = textBlockBottom - sunflowerSize * 0.6;
        break;
    }

    const adjustedSunflowerX = Math.max(0, Math.min(canvasWidth - sunflowerSize, sunflowerX + sunflowerOffset[0]));
    const adjustedSunflowerY = Math.max(0, Math.min(canvasHeight - sunflowerSize, sunflowerY + sunflowerOffset[1]));

    console.log('Drawing sunflower image...');
    ctx.drawImage(sunflowerImage, adjustedSunflowerX, adjustedSunflowerY, sunflowerSize, sunflowerSize);
    console.log('Sunflower image drawn at:', { adjustedSunflowerX, adjustedSunflowerY, sunflowerSize });

    // Zeichne die Balken
    balkenPositions.forEach((balken, index) => {
      const { x, y, width, height } = balken;
      const { background, text } = colors[index];

      const points = [
        { x: x, y: y },
        { x: x + width - (height * Math.tan(12 * Math.PI / 180)) / 2, y: y },
        { x: x + width + (height * Math.tan(12 * Math.PI / 180)) / 2, y: y + height },
        { x: x + (height * Math.tan(12 * Math.PI / 180)) / 2, y: y + height }
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
      ctx.fillText(textLines[index].text, textX, textY);

      console.log(`Balken ${index} drawn at: x=${x}, y=${y}, width=${width}, height=${height}`);
    });
   
    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('Fehler beim Erstellen des Bildes:', err);
    if (err.name === 'TypeError') {
      throw new Error('Ungültige Parameterwerte: ' + err.message);
    }
    throw err;
  }
}

router.post('/', upload.single('image'), async (req, res) => {
  console.log('Received request body:', req.body);

  try {
    const {
      balkenGruppe_offset_x, balkenGruppe_offset_y, fontSize,
      colors_0_background, colors_0_text,
      colors_1_background, colors_1_text,
      colors_2_background, colors_2_text,
      balkenOffset_0, balkenOffset_1, balkenOffset_2,
      line1, line2, line3,
      sunflower_offset_x, sunflower_offset_y,
      sunflowerPosition
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
        parseFloat(balkenOffset_0) || params.DEFAULT_BALKEN_OFFSET[0],
        parseFloat(balkenOffset_1) || params.DEFAULT_BALKEN_OFFSET[1],
        parseFloat(balkenOffset_2) || params.DEFAULT_BALKEN_OFFSET[2]
      ],
      sunflowerOffset: [
        parseFloat(sunflower_offset_x) || 0,
        parseFloat(sunflower_offset_y) || 0
      ],
      sunflowerPosition: sunflowerPosition || params.DEFAULT_SUNFLOWER_POSITION
    };

    console.log('Parsed modParams:', modParams);

    await checkFiles();
    registerFonts();

    const validatedParams = validateParams(modParams);
    console.log('Validated params:', validatedParams);

    const processedText = await processText({ line1, line2, line3 });
    console.log('Processed text:', processedText);

    const generatedImageBuffer = await addTextToImage(uploadedImageBuffer, processedText, validatedParams);
    const base64Image = `data:image/png;base64,${generatedImageBuffer.toString('base64')}`;

    console.log('Image generated successfully and converted to Base64');

    res.json({ image: base64Image });
  } catch (err) {
    console.error('Fehler bei der Anfrage:', err);
    res.status(500).json({ error: 'Fehler beim Erstellen des Bildes: ' + err.message });
  }
});

module.exports = router;