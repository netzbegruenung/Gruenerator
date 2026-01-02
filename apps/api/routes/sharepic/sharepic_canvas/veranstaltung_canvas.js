import { createCanvas, loadImage } from 'canvas';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import { COLORS } from '../../../services/sharepic/canvas/config.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';
const log = createLogger('veranstaltung_canvas');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

try {
  registerFonts();
} catch (err) {
  log.error('Fehler beim Registrieren der Schriftarten:', err);
  process.exit(1);
}

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const PHOTO_HEIGHT_RATIO = 0.4;
const PHOTO_HEIGHT = Math.round(CANVAS_HEIGHT * PHOTO_HEIGHT_RATIO);
const GREEN_SECTION_HEIGHT = CANVAS_HEIGHT - PHOTO_HEIGHT;

const CIRCLE_RADIUS = 200;
const CIRCLE_CENTER_X = CANVAS_WIDTH - CIRCLE_RADIUS + 50;
const CIRCLE_CENTER_Y = PHOTO_HEIGHT + 334;
const CIRCLE_TEXT_ROTATION = -10 * Math.PI / 180;

const TEXT_LEFT_MARGIN = 55;
const TEXT_MAX_WIDTH = 620;

// Default font sizes (in pixels)
const DEFAULT_FONT_SIZES = {
  eventTitle: 94,
  beschreibung: 62,
  circleWeekday: 57,
  circleDate: 55,
  circleTime: 55,
  footer: 42,
  titleLineHeight: 102
};

async function createVeranstaltungImage(imagePath, outputPath, params) {
  const {
    eventTitle,
    beschreibung,
    weekday,
    date,
    time,
    locationName,
    address,
    // Font sizes (direct px values, clamped in route handler)
    fontSizeEventTitle = 94,
    fontSizeBeschreibung = 62,
    fontSizeWeekday = 57,
    fontSizeDate = 55,
    fontSizeTime = 55,
    fontSizeLocationName = 42,
    fontSizeAddress = 42
  } = params;

  const scaledFontSizes = {
    eventTitle: fontSizeEventTitle,
    beschreibung: fontSizeBeschreibung,
    circleWeekday: fontSizeWeekday,
    circleDate: fontSizeDate,
    circleTime: fontSizeTime,
    locationName: fontSizeLocationName,
    address: fontSizeAddress,
    titleLineHeight: Math.round(fontSizeEventTitle * 1.08)
  };

  const image = await loadImage(imagePath);
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  drawPhotoSection(ctx, image);
  drawGreenSection(ctx);
  drawHimmelCircle(ctx, weekday, date, time, scaledFontSizes);
  drawEventText(ctx, eventTitle, beschreibung, scaledFontSizes);
  drawLocationFooter(ctx, locationName, address, scaledFontSizes);

  const rawBuffer = canvas.toBuffer('image/png');
  const optimizedBuffer = await optimizeCanvasBuffer(rawBuffer);
  fs.writeFileSync(outputPath, optimizedBuffer);
  log.debug('Veranstaltungs-Sharepic erstellt:', outputPath);
}

function drawPhotoSection(ctx, image) {
  const imageAspectRatio = image.width / image.height;
  const targetAspectRatio = CANVAS_WIDTH / PHOTO_HEIGHT;

  let sx, sy, sWidth, sHeight;

  if (imageAspectRatio > targetAspectRatio) {
    sHeight = image.height;
    sWidth = image.height * targetAspectRatio;
    sx = (image.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = image.width;
    sHeight = image.width / targetAspectRatio;
    sx = 0;
    sy = (image.height - sHeight) / 2;
  }

  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, CANVAS_WIDTH, PHOTO_HEIGHT);
}

function drawGreenSection(ctx) {
  ctx.fillStyle = COLORS.TANNE;
  ctx.fillRect(0, PHOTO_HEIGHT, CANVAS_WIDTH, GREEN_SECTION_HEIGHT);
}

function drawHimmelCircle(ctx, weekday, date, time, scaledFontSizes) {
  ctx.fillStyle = COLORS.HIMMEL;
  ctx.beginPath();
  ctx.arc(CIRCLE_CENTER_X, CIRCLE_CENTER_Y, CIRCLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(CIRCLE_CENTER_X, CIRCLE_CENTER_Y);
  ctx.rotate(CIRCLE_TEXT_ROTATION);

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const circleLineHeight = 65;

  ctx.font = `bold ${scaledFontSizes.circleWeekday}px PTSans-Bold`;
  ctx.fillText(weekday, 0, -circleLineHeight);

  ctx.font = `${scaledFontSizes.circleDate}px PTSans-Regular`;
  ctx.fillText(date, 0, 5);

  ctx.font = `bold ${scaledFontSizes.circleTime}px PTSans-Bold`;
  ctx.fillText(time, 0, circleLineHeight + 15);

  ctx.restore();
}

function drawEventText(ctx, eventTitle, beschreibung, scaledFontSizes) {
  const startY = PHOTO_HEIGHT + 60;
  let currentY = startY;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Event title
  ctx.font = `italic bold ${scaledFontSizes.eventTitle}px GrueneTypeNeue`;
  ctx.fillStyle = '#FFFFFF';
  const titleLines = wrapText(ctx, eventTitle.toUpperCase(), TEXT_MAX_WIDTH);
  titleLines.forEach(line => {
    ctx.fillText(line, TEXT_LEFT_MARGIN, currentY);
    currentY += scaledFontSizes.titleLineHeight;
  });

  currentY += 26;

  // Beschreibung - Zitat-style word wrapping
  if (beschreibung && beschreibung.trim()) {
    const fontSize = scaledFontSizes.beschreibung;
    const lineHeight = Math.round(fontSize * 1.17);

    ctx.font = `italic ${fontSize}px GrueneTypeNeue`;
    ctx.fillStyle = '#FFFFFF';

    const words = beschreibung.split(' ');
    let line = '';

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > TEXT_MAX_WIDTH && i > 0) {
        ctx.fillText(line.trim(), TEXT_LEFT_MARGIN, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), TEXT_LEFT_MARGIN, currentY);
  }
}

function drawLocationFooter(ctx, locationName, address, scaledFontSizes) {
  const footerY = CANVAS_HEIGHT - 120;

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Location name with its own font size
  ctx.font = `${scaledFontSizes.locationName}px PTSans-Regular`;
  ctx.fillText(locationName, TEXT_LEFT_MARGIN, footerY);

  // Address with its own font size
  const lineHeight = Math.round(Math.max(scaledFontSizes.locationName, scaledFontSizes.address) * 1.2);
  ctx.font = `${scaledFontSizes.address}px PTSans-Regular`;
  ctx.fillText(address, TEXT_LEFT_MARGIN, footerY + lineHeight);
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i] + ' ';
    const testWidth = ctx.measureText(testLine).width;

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
  let outputImagePath;
  try {
    const {
      eventTitle,
      beschreibung,
      weekday,
      date,
      time,
      locationName,
      address,
      // Font sizes (px values)
      fontSizeEventTitle,
      fontSizeBeschreibung,
      fontSizeWeekday,
      fontSizeDate,
      fontSizeTime,
      fontSizeLocationName,
      fontSizeAddress
    } = req.body;

    if (!eventTitle) throw new Error('Event-Titel ist erforderlich');
    if (!weekday) throw new Error('Wochentag ist erforderlich');
    if (!date) throw new Error('Datum ist erforderlich');
    if (!time) throw new Error('Uhrzeit ist erforderlich');
    if (!locationName) throw new Error('Veranstaltungsort ist erforderlich');
    if (!address) throw new Error('Adresse ist erforderlich');
    if (!req.file) throw new Error('Bild ist erforderlich');

    const imagePath = req.file.path;
    outputImagePath = path.join('uploads', `veranstaltung-${uuidv4()}.png`);

    // Parse font sizes with validation (clamp to valid px ranges)
    const clampFontSize = (val, defaultVal, min, max) =>
      Math.max(min, Math.min(max, parseInt(val, 10) || defaultVal));

    await createVeranstaltungImage(imagePath, outputImagePath, {
      eventTitle,
      beschreibung: beschreibung || '',
      weekday,
      date,
      time,
      locationName,
      address,
      fontSizeEventTitle: clampFontSize(fontSizeEventTitle, 94, 66, 122),
      fontSizeBeschreibung: clampFontSize(fontSizeBeschreibung, 62, 40, 80),
      fontSizeWeekday: clampFontSize(fontSizeWeekday, 57, 40, 74),
      fontSizeDate: clampFontSize(fontSizeDate, 55, 39, 72),
      fontSizeTime: clampFontSize(fontSizeTime, 55, 39, 72),
      fontSizeLocationName: clampFontSize(fontSizeLocationName, 42, 29, 55),
      fontSizeAddress: clampFontSize(fontSizeAddress, 42, 29, 55)
    });

    const imageBuffer = fs.readFileSync(outputImagePath);
    const base64Image = bufferToBase64(imageBuffer);

    res.json({ image: base64Image });
  } catch (err) {
    log.error('Fehler bei der Veranstaltungs-Sharepic-Erstellung:', err);
    res.status(500).send('Fehler beim Erstellen des Bildes: ' + err.message);
  } finally {
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) log.error('Fehler beim Löschen der temporären Upload-Datei:', err);
      });
    }
    if (outputImagePath) {
      fs.unlink(outputImagePath, (err) => {
        if (err) log.error('Fehler beim Löschen der temporären Output-Datei:', err);
      });
    }
  }
});

export default router;