import { createCanvas, loadImage, type Canvas, type SKRSContext2D as CanvasRenderingContext2D, type Image } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { checkFiles, registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('zitat_canvas');
const router: Router = Router();
const upload = multer({ dest: 'uploads/' });

const quotationMarkPath = path.resolve(__dirname, '../../../public/quote-white.svg');

try {
  registerFonts();
} catch (err) {
  log.error('Fehler beim Registrieren der Schriftarten:', err);
  process.exit(1);
}

if (!fs.existsSync(quotationMarkPath)) {
  throw new Error(`Anführungszeichen-SVG nicht gefunden: ${quotationMarkPath}`);
}

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

interface ZitatRequestBody {
  quote: string;
  name: string;
  fontSize?: string;
}

async function addTextToImage(
  imagePath: string,
  outputImagePath: string,
  quote: string,
  name: string,
  fontSize: number = 60
): Promise<void> {
  try {
    log.debug('Lade Bild:', imagePath);
    const [image, quotationMark] = await Promise.all([
      loadImage(imagePath),
      loadImage(quotationMarkPath)
    ]) as [Image, Image];
    log.debug('Bilder erfolgreich geladen');

    const canvas: Canvas = createCanvas(1080, 1350);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    const imageAspectRatio = image.width / image.height;
    const canvasAspectRatio = 1080 / 1350;

    let sx: number, sy: number, sWidth: number, sHeight: number;

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

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 1080, 1350);

    const gradient = ctx.createLinearGradient(0, 0, 0, 1350);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1350);

    const lineHeight = Math.round(fontSize * 1.17);
    const nameFontSize = Math.round(fontSize * 0.67);
    const quoteMarkSize = Math.round(fontSize * 1.67);
    const nameOffset = Math.round(fontSize * 1.33);

    const quoteMarkY = 750;
    ctx.fillStyle = 'white';
    ctx.drawImage(quotationMark, 50, quoteMarkY, quoteMarkSize, quoteMarkSize);

    ctx.font = `${fontSize}px GrueneTypeNeue`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const quoteX = 50;
    const quoteY = quoteMarkY + quoteMarkSize + 10;
    const quoteWidth = 980;

    const words = quote.split(' ');
    let line = '';
    let y = quoteY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > quoteWidth && i > 0) {
        ctx.fillText(line, quoteX, y);
        line = words[i] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, quoteX, y);

    ctx.font = `${nameFontSize}px GrueneTypeNeue`;
    ctx.fillStyle = 'white';
    ctx.fillText(name, quoteX, y + nameOffset);

    const rawBuffer = canvas.toBuffer('image/png');
    const optimizedBuffer = await optimizeCanvasBuffer(rawBuffer);
    fs.writeFileSync(outputImagePath, optimizedBuffer);
    log.debug('Bild erfolgreich gespeichert:', outputImagePath);
  } catch (err) {
    log.error('Fehler beim Erstellen des Bildes:', err);
    throw err;
  }
}

router.post('/', upload.single('image'), async (req: MulterRequest, res: Response): Promise<void> => {
  let outputImagePath: string | undefined;
  try {
    const { quote, name, fontSize: fontSizeParam } = req.body as ZitatRequestBody;

    if (!quote || typeof quote !== 'string') {
      throw new Error('Zitat ist erforderlich');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Name ist erforderlich');
    }
    if (!req.file) {
      throw new Error('Bild ist erforderlich');
    }

    const fontSize = Math.max(45, Math.min(80, parseInt(fontSizeParam || '60', 10) || 60));

    const imagePath = req.file.path;
    outputImagePath = path.join('uploads', `output-${uuidv4()}.png`);

    await addTextToImage(imagePath, outputImagePath, quote, name, fontSize);

    const imageBuffer = fs.readFileSync(outputImagePath);
    const base64Image = bufferToBase64(imageBuffer);

    res.json({ image: base64Image });
  } catch (err) {
    const error = err as Error;
    log.error('Fehler bei der Anfrage:', error);
    res.status(500).send('Fehler beim Erstellen des Bildes: ' + error.message);
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
