const { createCanvas, loadImage } = require('canvas');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { checkFiles, registerFonts } = require('./fileManagement');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Pfade definieren
const quotationMarkPath = path.resolve(__dirname, '../../../public/quote.svg');

// Initialize fonts using shared system
try {
  registerFonts();
} catch (err) {
  console.error('Fehler beim Registrieren der Schriftarten:', err);
  process.exit(1);
}

// Check if quotation mark file exists
if (!fs.existsSync(quotationMarkPath)) {
  throw new Error(`Anführungszeichen-SVG nicht gefunden: ${quotationMarkPath}`);
}

async function addTextToImage(imagePath, outputImagePath, quote, name) {
  try {
    console.log('Lade Bild:', imagePath);
    const [image, quotationMark] = await Promise.all([
      loadImage(imagePath),
      loadImage(quotationMarkPath)
    ]);
    console.log('Bilder erfolgreich geladen');

    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');

    const imageAspectRatio = image.width / image.height;
    const canvasAspectRatio = 1080 / 1350;

    let sx, sy, sWidth, sHeight;

    if (imageAspectRatio > canvasAspectRatio) {
      // Bild ist breiter als das Canvas
      sHeight = image.height;
      sWidth = image.height * canvasAspectRatio;
      sx = (image.width - sWidth) / 2;
      sy = 0;
    } else {
      // Bild ist höher als das Canvas
      sWidth = image.width;
      sHeight = image.width / canvasAspectRatio;
      sx = 0;
      sy = (image.height - sHeight) / 2;
    }

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 1080, 1350);
    
    // Gradient Overlay hinzufügen
    const gradient = ctx.createLinearGradient(0, 0, 0, 1350);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1350);

    // Anführungszeichen hinzufügen
    const quoteMarkSize = 100;
    const quoteMarkY = 750; // Balanced position in lower half with proper margins (750/1350 = 56% down)
    ctx.fillStyle = 'white';
    ctx.drawImage(quotationMark, 50, quoteMarkY, quoteMarkSize, quoteMarkSize);

    // Zitat hinzufügen
    ctx.font = '60px GrueneType';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const quoteX = 50;
    const quoteY = quoteMarkY + quoteMarkSize + 10;
    const quoteWidth = 980;

    // Zitat auf mehrere Zeilen aufteilen
    const words = quote.split(' ');
    let line = '';
    let y = quoteY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > quoteWidth && i > 0) {
        ctx.fillText(line, quoteX, y);
        line = words[i] + ' ';
        y += 70;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, quoteX, y);

    // Name hinzufügen
    ctx.font = '40px GrueneType';
    ctx.fillStyle = 'white';
    ctx.fillText(name, quoteX, y + 80);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputImagePath, buffer);
    console.log('Bild erfolgreich gespeichert:', outputImagePath);
  } catch (err) {
    console.error('Fehler beim Erstellen des Bildes:', err);
    throw err;
  }
}

router.post('/', upload.single('image'), async (req, res) => {
  let outputImagePath;
  try {
    const { quote, name } = req.body;
    
    // Validierung hinzufügen
    if (!quote || typeof quote !== 'string') {
      throw new Error('Zitat ist erforderlich');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Name ist erforderlich');
    }
    if (!req.file) {
      throw new Error('Bild ist erforderlich');
    }

    const imagePath = req.file.path;
    outputImagePath = path.join('uploads', `output-${uuidv4()}.png`);

    await addTextToImage(imagePath, outputImagePath, quote, name);
    
    const imageBuffer = fs.readFileSync(outputImagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    res.json({ image: base64Image });
  } catch (err) {
    console.error('Fehler bei der Anfrage:', err);
    res.status(500).send('Fehler beim Erstellen des Bildes: ' + err.message);
  } finally {
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Fehler beim Löschen der temporären Upload-Datei:', err);
      });
    }
    if (outputImagePath) {
      fs.unlink(outputImagePath, (err) => {
        if (err) console.error('Fehler beim Löschen der temporären Output-Datei:', err);
      });
    }
  }
});

module.exports = router;
