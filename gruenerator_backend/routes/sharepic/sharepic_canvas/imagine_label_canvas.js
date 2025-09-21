const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const { COLORS } = require('./config');
const { checkFiles, registerFonts } = require('./fileManagement');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const LABEL_TEXT = 'KI-Generiert mit dem Grünerator';

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const effectiveRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + effectiveRadius, y);
  ctx.lineTo(x + width - effectiveRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + effectiveRadius);
  ctx.lineTo(x + width, y + height - effectiveRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - effectiveRadius, y + height);
  ctx.lineTo(x + effectiveRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - effectiveRadius);
  ctx.lineTo(x, y + effectiveRadius);
  ctx.quadraticCurveTo(x, y, x + effectiveRadius, y);
  ctx.closePath();
}

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Kein Bild hochgeladen.' });
    }

    await checkFiles();
    registerFonts();

    const img = await loadImage(req.file.buffer);
    const { width, height } = img;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, width, height);

    const paddingX = Math.max(16, Math.round(width * 0.02));
    const paddingY = Math.max(12, Math.round(height * 0.015));

    const baseFontSize = Math.min(width, height) * 0.035;
    const fontSize = Math.max(18, Math.min(42, Math.round(baseFontSize)));
    const fontFamily = '600 ' + fontSize + 'px PTSans-Bold';

    ctx.font = fontFamily;
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(LABEL_TEXT);
    const textWidth = textMetrics.width;
    const rectHorizontalPadding = Math.round(fontSize * 0.6);
    const rectVerticalPadding = Math.round(fontSize * 0.45);

    const rectWidth = textWidth + rectHorizontalPadding * 2;
    const rectHeight = fontSize + rectVerticalPadding * 2;
    const rectX = paddingX;
    const rectY = height - rectHeight - paddingY;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = COLORS?.TANNE || 'rgba(0, 46, 35, 0.9)';
    drawRoundedRect(ctx, rectX, rectY, rectWidth, rectHeight, Math.round(fontSize * 0.6));
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(LABEL_TEXT, rectX + rectHorizontalPadding, rectY + rectHeight / 2);

    const outputBuffer = canvas.toBuffer('image/png');
    const base64Image = `data:image/png;base64,${outputBuffer.toString('base64')}`;

    res.json({ image: base64Image });
  } catch (error) {
    console.error('[imagine_label_canvas] Fehler beim Beschriften des Bildes:', error);
    res.status(500).json({ error: 'Fehler beim Beschriften des Bildes.' });
  }
});

module.exports = router;
