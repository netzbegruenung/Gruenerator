import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D, Image } from 'canvas';
import { checkFiles, registerFonts } from '../../routes/sharepic/sharepic_canvas/fileManagement.js';
import { COLORS } from '../../routes/sharepic/sharepic_canvas/config.js';
import { createLogger } from '../../utils/logger.js';
import type {
  BrandColors,
  VariantConfig,
  ImagineComposeOptions,
  GradientConfig,
  BarConfig,
  TemplateConfig
} from './types.js';

const log = createLogger('ImagineCanvasRenderer');

let fontsRegistered = false;

function ensureFontsRegistered(): void {
  if (!fontsRegistered) {
    registerFonts();
    fontsRegistered = true;
    log.debug('Fonts registered for canvas rendering');
  }
}

ensureFontsRegistered();

export const OUTPUT_WIDTH: number = 1080;
export const OUTPUT_HEIGHT: number = 1350;
export const FLUX_WIDTH: number = 768;
export const FLUX_HEIGHT: number = 960;

export const BRAND_COLORS: Readonly<BrandColors> = {
  TANNE: COLORS.TANNE || '#005538',
  SAND: COLORS.SAND || '#F5F1E9',
  WHITE: '#FFFFFF',
  KLEE: COLORS.KLEE || '#008939'
};

export const VARIANT_CONFIGS: Readonly<Record<string, VariantConfig>> = {
  'light-top': {
    name: 'Light Top',
    textArea: { y: 0, height: 0.20 },
    defaultTextColor: BRAND_COLORS.TANNE
  },
  'green-bottom': {
    name: 'Green Bottom',
    textArea: { y: 0.80, height: 0.20 },
    defaultTextColor: BRAND_COLORS.WHITE
  }
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function calculateFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  minSize: number = 40,
  maxSize: number = 140
): { fontSize: number; lines: string[] } {
  let fontSize = maxSize;
  const lineHeightMultiplier = 1.15;

  while (fontSize >= minSize) {
    ctx.font = `${fontSize}px ${fontFamily}`;
    const lines = wrapText(ctx, text, maxWidth * 0.92);
    const totalHeight = lines.length * fontSize * lineHeightMultiplier;

    if (totalHeight <= maxHeight && lines.every(line => ctx.measureText(line).width <= maxWidth * 0.95)) {
      return { fontSize, lines };
    }
    fontSize -= 4;
  }

  ctx.font = `${minSize}px ${fontFamily}`;
  return { fontSize: minSize, lines: wrapText(ctx, text, maxWidth * 0.92) };
}

function renderFluxImage(
  ctx: CanvasRenderingContext2D,
  image: Image,
  templateConfig: TemplateConfig,
  outputWidth: number,
  outputHeight: number
): void {
  const { imageArea } = templateConfig;
  if (!imageArea) return;

  const destY = Math.round(imageArea.y * outputHeight);
  const destHeight = Math.round(imageArea.height * outputHeight);

  const imageAspectRatio = image.width / image.height;
  const areaAspectRatio = outputWidth / destHeight;

  let sx = 0, sy = 0, sWidth = image.width, sHeight = image.height;

  if (imageAspectRatio > areaAspectRatio) {
    sWidth = image.height * areaAspectRatio;
    sx = (image.width - sWidth) / 2;
  } else {
    sHeight = image.width / areaAspectRatio;
    sy = (image.height - sHeight) / 2;
  }

  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, destY, outputWidth, destHeight);
  log.debug(`Rendered FLUX image: area y=${destY}, height=${destHeight}`);
}

function renderGradientOverlay(
  ctx: CanvasRenderingContext2D,
  gradientConfig: GradientConfig,
  outputWidth: number,
  outputHeight: number
): void {
  const { direction, startY, endY, centerY, spread, opacity } = gradientConfig;

  let gradient: CanvasGradient;

  if (direction === 'top' && startY !== undefined && endY !== undefined) {
    const gradStartY = Math.round(startY * outputHeight);
    const gradEndY = Math.round(endY * outputHeight);
    gradient = ctx.createLinearGradient(0, gradStartY, 0, gradEndY);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, gradStartY, outputWidth, gradEndY - gradStartY);
  } else if (direction === 'bottom' && startY !== undefined && endY !== undefined) {
    const gradStartY = Math.round(startY * outputHeight);
    const gradEndY = Math.round(endY * outputHeight);
    gradient = ctx.createLinearGradient(0, gradStartY, 0, gradEndY);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${opacity})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, gradStartY, outputWidth, gradEndY - gradStartY);
  } else if (direction === 'center') {
    const center = Math.round((centerY || 0.5) * outputHeight);
    const spreadPx = Math.round((spread || 0.3) * outputHeight);
    const topY = center - spreadPx;
    const bottomY = center + spreadPx;

    gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.3, `rgba(0, 0, 0, ${opacity})`);
    gradient.addColorStop(0.7, `rgba(0, 0, 0, ${opacity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, topY, outputWidth, bottomY - topY);
  }

  log.debug(`Rendered gradient overlay: direction=${direction}`);
}

function renderSolidBar(
  ctx: CanvasRenderingContext2D,
  barConfig: BarConfig,
  outputWidth: number,
  outputHeight: number
): void {
  const { y, height, color } = barConfig;
  const barY = Math.round(y * outputHeight);
  const barHeight = Math.round(height * outputHeight);

  ctx.fillStyle = color;
  ctx.fillRect(0, barY, outputWidth, barHeight);
  log.debug(`Rendered solid bar: y=${barY}, height=${barHeight}, color=${color}`);
}

function renderTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  templateConfig: TemplateConfig,
  outputWidth: number,
  outputHeight: number,
  color: string
): void {
  const { textArea } = templateConfig;
  const textY = textArea.y * outputHeight;
  const textHeight = textArea.height * outputHeight;
  const maxWidth = outputWidth * 0.90;
  const fontFamily = 'GrueneTypeNeue';

  const { fontSize, lines } = calculateFontSize(
    ctx,
    title,
    maxWidth,
    textHeight * 0.85,
    fontFamily,
    48,
    120
  );

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineHeight = fontSize * 1.15;
  const totalTextHeight = lines.length * lineHeight;
  const startY = textY + (textHeight * 0.5) - (totalTextHeight / 2) + lineHeight / 2;

  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;
    ctx.fillText(line, outputWidth / 2, lineY);
  });

  log.debug(`Rendered title: "${title.substring(0, 30)}..." fontSize=${fontSize}, lines=${lines.length}`);
}

export async function composeImagineCreate(
  fluxImageBuffer: Buffer,
  options: ImagineComposeOptions
): Promise<Buffer> {
  await checkFiles();
  ensureFontsRegistered();

  const {
    title,
    titleColor,
    variant = 'light-top',
    outputWidth = OUTPUT_WIDTH,
    outputHeight = OUTPUT_HEIGHT
  } = options;

  const variantConfig = VARIANT_CONFIGS[variant] || VARIANT_CONFIGS['light-top'];

  log.debug(`Composing imagine create: variant="${variant}", title="${title?.substring(0, 30)}..."`);

  const canvas: Canvas = createCanvas(outputWidth, outputHeight);
  const ctx = canvas.getContext('2d');

  const fluxImage = await loadImage(fluxImageBuffer);
  log.debug(`Loaded FLUX image: ${fluxImage.width}x${fluxImage.height}`);

  const imageAspectRatio = fluxImage.width / fluxImage.height;
  const canvasAspectRatio = outputWidth / outputHeight;

  let sx = 0, sy = 0, sWidth = fluxImage.width, sHeight = fluxImage.height;

  if (imageAspectRatio > canvasAspectRatio) {
    sWidth = fluxImage.height * canvasAspectRatio;
    sx = (fluxImage.width - sWidth) / 2;
  } else {
    sHeight = fluxImage.width / canvasAspectRatio;
    sy = (fluxImage.height - sHeight) / 2;
  }

  ctx.drawImage(fluxImage, sx, sy, sWidth, sHeight, 0, 0, outputWidth, outputHeight);

  const finalTitleColor = titleColor || variantConfig.defaultTextColor;
  renderTitle(ctx, title, variantConfig, outputWidth, outputHeight, finalTitleColor);

  const buffer = canvas.toBuffer('image/png');
  log.debug(`Canvas composition complete: ${buffer.length} bytes`);

  return buffer;
}
