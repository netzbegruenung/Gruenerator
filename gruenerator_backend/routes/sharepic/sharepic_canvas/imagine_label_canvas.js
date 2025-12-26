const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const { COLORS } = require('./config');
const { checkFiles, registerFonts } = require('./fileManagement');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('imagine_label_c');


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const LABEL_TEXT = 'KI-Generiert mit dem Grünerator';

async function addKiLabel(imageBuffer) {
  await checkFiles();
  registerFonts();

  const img = await loadImage(imageBuffer);
  const { width, height } = img;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0, width, height);

  const baseFontSize = Math.min(width, height) * 0.022;
  const fontSize = Math.max(12, Math.min(24, Math.round(baseFontSize)));
  const fontFamily = '600 ' + fontSize + 'px PTSans-Bold';

  ctx.font = fontFamily;
  ctx.textBaseline = 'middle';

  const textMetrics = ctx.measureText(LABEL_TEXT);
  const textWidth = textMetrics.width;
  const rectHorizontalPadding = Math.round(fontSize * 0.5);
  const rectVerticalPadding = Math.round(fontSize * 0.35);

  const rectWidth = textWidth + rectHorizontalPadding * 2;
  const rectHeight = fontSize + rectVerticalPadding * 2;
  const rectX = 0;
  const rectY = height - rectHeight;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS?.TANNE || 'rgba(0, 46, 35, 0.9)';
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
  ctx.restore();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(LABEL_TEXT, rectX + rectHorizontalPadding, rectY + rectHeight / 2);

  return canvas.toBuffer('image/png');
}

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Kein Bild hochgeladen.' });
    }

    const outputBuffer = await addKiLabel(req.file.buffer);
    const base64Image = `data:image/png;base64,${outputBuffer.toString('base64')}`;

    res.json({ image: base64Image });
  } catch (error) {
    log.error('[imagine_label_canvas] Fehler beim Beschriften des Bildes:', error);
    res.status(500).json({ error: 'Fehler beim Beschriften des Bildes.' });
  }
});

module.exports = { router, addKiLabel };
