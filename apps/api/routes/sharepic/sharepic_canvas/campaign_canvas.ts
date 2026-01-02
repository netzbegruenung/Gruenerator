import { Router, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createCanvas, loadImage, registerFont, type Canvas, type CanvasRenderingContext2D, type Image } from 'canvas';
import path from 'path';
import fs from 'fs';
import { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH } from '../../../services/sharepic/canvas/config.js';
import { optimizeCanvasBuffer, bufferToBase64 } from '../../../services/sharepic/canvas/imageOptimizer.js';
import { createLogger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('campaign_canvas');
const router: Router = Router();

registerFont(FONT_PATH, { family: 'GrueneTypeNeue' });
if (fs.existsSync(PTSANS_REGULAR_PATH)) {
  registerFont(PTSANS_REGULAR_PATH, { family: 'PTSans-Regular' });
}
if (fs.existsSync(PTSANS_BOLD_PATH)) {
  registerFont(PTSANS_BOLD_PATH, { family: 'PTSans-Bold' });
}

interface TextLineConfig {
  field: string;
  x: number;
  y: number;
  fontSize: number;
  font: string;
  color: string;
  style?: string;
  align?: CanvasTextAlign;
  maxWidth?: number;
  lineHeight?: number;
}

interface DecorationConfig {
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}

interface CreditConfig {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  font: string;
  color: string;
  align?: CanvasTextAlign;
}

interface CanvasConfig {
  width: number;
  height: number;
  backgroundImage?: string;
  backgroundColor?: string;
  textLines?: TextLineConfig[];
  decorations?: DecorationConfig[];
  credit?: CreditConfig;
}

interface CampaignConfig {
  canvas: CanvasConfig;
  basedOn?: string;
}

interface TextData {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  [key: string]: string | undefined;
}

interface CampaignCanvasResult {
  image: string;
  creditText: string;
}

interface CampaignRequestBody {
  campaignConfig?: CampaignConfig;
  textData?: TextData;
  campaignId?: string;
  campaignTypeId?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  location?: string;
  thema?: string;
  customCredit?: string;
}

function loadCampaignConfig(campaignId: string, typeId: string): CampaignConfig | null {
  if (!campaignId || !typeId) return null;

  const campaignPath = path.join(__dirname, '../../../config/campaigns', `${campaignId}.json`);

  if (!fs.existsSync(campaignPath)) {
    log.warn(`[CampaignCanvas] Config not found: ${campaignPath}`);
    return null;
  }

  try {
    const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
    const typeConfig = campaign.types?.[typeId];

    if (!typeConfig) {
      log.warn(`[CampaignCanvas] Type ${typeId} not found in campaign ${campaignId}`);
      return null;
    }

    let canvasConfig: CanvasConfig;

    if (typeConfig.theme && campaign.defaultCanvas && campaign.colorThemes) {
      const theme = campaign.colorThemes[typeConfig.theme];

      if (!theme) {
        log.warn(`[CampaignCanvas] Theme ${typeConfig.theme} not found in campaign ${campaignId}`);
        return null;
      }

      canvasConfig = JSON.parse(JSON.stringify(campaign.defaultCanvas));

      canvasConfig.textLines = canvasConfig.textLines?.map((line: TextLineConfig) => ({
        ...line,
        color: theme.textColor
      }));

      if (canvasConfig.credit) {
        canvasConfig.credit = {
          ...canvasConfig.credit,
          color: theme.creditColor,
          y: theme.creditY
        };
      }

      canvasConfig.backgroundImage = typeConfig.backgroundImage;

      log.debug(`[CampaignCanvas] Built canvas for ${campaignId}/${typeId} using theme '${typeConfig.theme}'`);
    } else {
      canvasConfig = typeConfig.canvas;
    }

    log.debug(`[CampaignCanvas] Loaded config for ${campaignId}/${typeId}`);

    return {
      canvas: canvasConfig,
      basedOn: typeConfig.basedOn
    };
  } catch (error) {
    log.error(`[CampaignCanvas] Failed to load config:`, error);
    return null;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
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

async function renderBackground(
  ctx: CanvasRenderingContext2D,
  config: CanvasConfig,
  width: number,
  height: number
): Promise<void> {
  if (config.backgroundImage) {
    const bgPath = path.join(__dirname, '../../../public', config.backgroundImage);

    if (!fs.existsSync(bgPath)) {
      log.warn(`[CampaignCanvas] Background image not found: ${bgPath}`);
      ctx.fillStyle = config.backgroundColor || '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    log.debug(`[CampaignCanvas] Loading background image: ${bgPath}`);
    const bgImage: Image = await loadImage(bgPath);

    const imageAspectRatio = bgImage.width / bgImage.height;
    const canvasAspectRatio = width / height;

    let sx = 0, sy = 0, sWidth = bgImage.width, sHeight = bgImage.height;

    if (imageAspectRatio > canvasAspectRatio) {
      sWidth = bgImage.height * canvasAspectRatio;
      sx = (bgImage.width - sWidth) / 2;
    } else {
      sHeight = bgImage.width / canvasAspectRatio;
      sy = (bgImage.height - sHeight) / 2;
    }

    ctx.drawImage(bgImage, sx, sy, sWidth, sHeight, 0, 0, width, height);
    log.debug(`[CampaignCanvas] Background image rendered successfully`);

  } else if (config.backgroundColor) {
    log.debug(`[CampaignCanvas] Using solid background color: ${config.backgroundColor}`);
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    log.debug(`[CampaignCanvas] Using default white background`);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }
}

async function renderDecorations(
  ctx: CanvasRenderingContext2D,
  decorations: DecorationConfig[]
): Promise<void> {
  for (const deco of decorations) {
    try {
      if (deco.type === 'image') {
        const decoPath = path.join(__dirname, '../../../public', deco.path);

        if (!fs.existsSync(decoPath)) {
          log.warn(`[CampaignCanvas] Decoration not found: ${decoPath}, skipping`);
          continue;
        }

        const decoImage: Image = await loadImage(decoPath);

        const oldAlpha = ctx.globalAlpha;
        if (deco.opacity !== undefined) {
          ctx.globalAlpha = deco.opacity;
        }

        ctx.drawImage(decoImage, deco.x, deco.y, deco.width, deco.height);
        ctx.globalAlpha = oldAlpha;

        log.debug(`[CampaignCanvas] Decoration rendered: ${deco.path}`);
      }
    } catch (error) {
      log.warn(`[CampaignCanvas] Failed to render decoration:`, (error as Error).message);
    }
  }
}

function renderTextLines(
  ctx: CanvasRenderingContext2D,
  textLines: TextLineConfig[],
  textData: TextData
): void {
  for (const lineConfig of textLines) {
    const text = textData[lineConfig.field];

    if (!text) {
      log.warn(`[CampaignCanvas] No text data for field: ${lineConfig.field}`);
      continue;
    }

    const fontStyle = lineConfig.style || '';
    const font = `${fontStyle} ${lineConfig.fontSize}px ${lineConfig.font}`.trim();
    ctx.font = font;
    ctx.fillStyle = lineConfig.color;
    ctx.textAlign = lineConfig.align || 'left';

    log.debug(`[CampaignCanvas] Rendering text "${text}" with font: ${font}`);

    if (lineConfig.maxWidth && lineConfig.lineHeight) {
      const lines = wrapText(ctx, text, lineConfig.maxWidth);
      let currentY = lineConfig.y;

      log.debug(`[CampaignCanvas] Text wrapped into ${lines.length} lines`);

      for (const line of lines) {
        ctx.fillText(line, lineConfig.x, currentY);
        currentY += lineConfig.lineHeight;
      }
    } else {
      ctx.fillText(text, lineConfig.x, lineConfig.y);
    }
  }
}

function renderCredit(
  ctx: CanvasRenderingContext2D,
  creditConfig: CreditConfig,
  location: string = '',
  customCredit: string | null = null
): string {
  ctx.font = `${creditConfig.fontSize}px ${creditConfig.font}`;
  ctx.fillStyle = creditConfig.color;
  ctx.textAlign = creditConfig.align || 'left';

  let creditText: string;

  if (customCredit && customCredit.trim()) {
    creditText = customCredit;
  } else {
    creditText = creditConfig.text;
    if (location && creditText.includes('{{location}}')) {
      creditText = creditText.replace(/\{\{location\}\}/g, location);
    }
  }

  ctx.fillText(creditText, creditConfig.x, creditConfig.y);
  log.debug(`[CampaignCanvas] Credit rendered: ${creditText}`);

  return creditText;
}

async function generateCampaignCanvas(
  campaignId: string,
  campaignTypeId: string,
  textData: TextData,
  location: string = '',
  customCredit: string | null = null
): Promise<CampaignCanvasResult> {
  const campaignConfig = loadCampaignConfig(campaignId, campaignTypeId);

  if (!campaignConfig) {
    throw new Error(`Campaign configuration not found: ${campaignId}/${campaignTypeId}`);
  }

  if (!campaignConfig.canvas) {
    throw new Error('Campaign canvas configuration required');
  }

  log.debug('[CampaignCanvas] Rendering with config:', {
    width: campaignConfig.canvas.width,
    height: campaignConfig.canvas.height,
    textLines: campaignConfig.canvas.textLines?.length,
    decorations: campaignConfig.canvas.decorations?.length,
    hasBackground: !!campaignConfig.canvas.backgroundImage || !!campaignConfig.canvas.backgroundColor
  });

  log.debug('[CampaignCanvas] Text data:', textData);

  const canvasConfig = campaignConfig.canvas;
  const canvas: Canvas = createCanvas(canvasConfig.width, canvasConfig.height);
  const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

  await renderBackground(ctx, canvasConfig, canvas.width, canvas.height);

  if (canvasConfig.decorations && canvasConfig.decorations.length > 0) {
    await renderDecorations(ctx, canvasConfig.decorations);
  }

  if (canvasConfig.textLines) {
    renderTextLines(ctx, canvasConfig.textLines, textData);
  }

  let creditText = '';
  if (canvasConfig.credit) {
    creditText = renderCredit(ctx, canvasConfig.credit, location, customCredit);
  }

  log.debug('[CampaignCanvas] Returning creditText:', creditText);

  const rawBuffer = canvas.toBuffer('image/png');
  const optimizedBuffer = await optimizeCanvasBuffer(rawBuffer);
  const base64Image = bufferToBase64(optimizedBuffer);
  return {
    image: base64Image,
    creditText: creditText
  };
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as CampaignRequestBody;
    let campaignConfig = body.campaignConfig;
    let textData = body.textData;

    const location = body.location || body.thema || '';
    const customCredit = body.customCredit || null;

    if (!campaignConfig) {
      const { campaignId, campaignTypeId } = body;

      log.debug(`[CampaignCanvas] Loading config for ${campaignId}/${campaignTypeId}`);

      if (!campaignId || !campaignTypeId) {
        res.status(400).json({
          success: false,
          error: 'Either campaignConfig or (campaignId + campaignTypeId) required'
        });
        return;
      }

      textData = {
        line1: body.line1 || '',
        line2: body.line2 || '',
        line3: body.line3 || '',
        line4: body.line4 || '',
        line5: body.line5 || ''
      };

      log.debug(`[CampaignCanvas] Text data from request:`, textData);

      const { image, creditText } = await generateCampaignCanvas(campaignId, campaignTypeId, textData, location, customCredit);
      res.json({
        success: true,
        image: image,
        creditText: creditText
      });
      return;
    }

    if (!campaignConfig.canvas) {
      res.status(400).json({
        success: false,
        error: 'Campaign canvas configuration required'
      });
      return;
    }

    log.debug('[CampaignCanvas] Rendering with config:', {
      width: campaignConfig.canvas.width,
      height: campaignConfig.canvas.height,
      textLines: campaignConfig.canvas.textLines?.length,
      decorations: campaignConfig.canvas.decorations?.length,
      hasBackground: !!campaignConfig.canvas.backgroundImage || !!campaignConfig.canvas.backgroundColor
    });

    log.debug('[CampaignCanvas] Text data:', textData);

    const canvasConfig = campaignConfig.canvas;
    const canvas: Canvas = createCanvas(canvasConfig.width, canvasConfig.height);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    await renderBackground(ctx, canvasConfig, canvas.width, canvas.height);

    if (canvasConfig.decorations && canvasConfig.decorations.length > 0) {
      await renderDecorations(ctx, canvasConfig.decorations);
    }

    if (canvasConfig.textLines && textData) {
      renderTextLines(ctx, canvasConfig.textLines, textData);
    }

    let creditText = '';
    if (canvasConfig.credit) {
      creditText = renderCredit(ctx, canvasConfig.credit, location, customCredit);
    }

    const rawBuffer = canvas.toBuffer('image/png');
    const optimizedBuffer = await optimizeCanvasBuffer(rawBuffer);
    const base64Image = bufferToBase64(optimizedBuffer);
    res.json({
      success: true,
      image: base64Image,
      creditText: creditText
    });

  } catch (error) {
    log.error('[CampaignCanvas] Error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
export { generateCampaignCanvas };
