/**
 * Text Components
 *
 * Text rendering components for headlines, body text, and quotes
 */

import { loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { registerComponent, CORPORATE_DESIGN, wrapText } from '../ComponentRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Large headline text
 */
registerComponent('text-headline', {
  category: 'text',
  description: 'Large headline text',
  parameters: {
    text: { type: 'string', required: true },
    color: { type: 'color', default: CORPORATE_DESIGN.colors.white },
    fontSize: { type: 'number', default: 90 },
    font: { type: 'string', default: 'GrueneTypeNeue' },
    align: { type: 'string', default: 'center' },
    maxWidth: { type: 'number', default: null },
    lineHeight: { type: 'number', default: 1.2 }
  },
  render: async (ctx, params, bounds) => {
    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.fillStyle = params.color;
    ctx.textAlign = params.align as CanvasTextAlign;
    ctx.textBaseline = 'top';

    const maxWidth = params.maxWidth || bounds.width - CORPORATE_DESIGN.spacing.medium * 2;
    const lines = wrapText(ctx, params.text, maxWidth);
    const lineHeightPx = params.fontSize * params.lineHeight;

    let x: number;
    switch (params.align) {
      case 'left':
        x = bounds.x + CORPORATE_DESIGN.spacing.medium;
        break;
      case 'right':
        x = bounds.x + bounds.width - CORPORATE_DESIGN.spacing.medium;
        break;
      default:
        x = bounds.x + bounds.width / 2;
    }

    let y = bounds.y;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lineHeightPx;
    }

    return true;
  }
});

/**
 * Body text with multi-line support
 */
registerComponent('text-body', {
  category: 'text',
  description: 'Body text with multi-line support',
  parameters: {
    text: { type: 'string', required: true },
    color: { type: 'color', default: CORPORATE_DESIGN.colors.white },
    fontSize: { type: 'number', default: 36 },
    font: { type: 'string', default: 'PTSans-Regular' },
    align: { type: 'string', default: 'left' },
    maxWidth: { type: 'number', default: null },
    lineHeight: { type: 'number', default: 1.4 }
  },
  render: async (ctx, params, bounds) => {
    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.fillStyle = params.color;
    ctx.textAlign = params.align as CanvasTextAlign;
    ctx.textBaseline = 'top';

    const maxWidth = params.maxWidth || bounds.width - CORPORATE_DESIGN.spacing.medium * 2;
    const lines = wrapText(ctx, params.text, maxWidth);
    const lineHeightPx = params.fontSize * params.lineHeight;

    let x: number;
    switch (params.align) {
      case 'left':
        x = bounds.x + CORPORATE_DESIGN.spacing.medium;
        break;
      case 'right':
        x = bounds.x + bounds.width - CORPORATE_DESIGN.spacing.medium;
        break;
      default:
        x = bounds.x + bounds.width / 2;
    }

    let y = bounds.y;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lineHeightPx;
    }

    return true;
  }
});

/**
 * Quote text with optional attribution
 */
registerComponent('text-quote', {
  category: 'text',
  description: 'Quote text with optional attribution',
  parameters: {
    text: { type: 'string', required: true },
    attribution: { type: 'string', default: null },
    textColor: { type: 'color', default: CORPORATE_DESIGN.colors.white },
    fontSize: { type: 'number', default: 50 },
    font: { type: 'string', default: 'GrueneTypeNeue' },
    showQuotationMarks: { type: 'boolean', default: true },
    align: { type: 'string', default: 'center' }
  },
  render: async (ctx, params, bounds) => {
    const padding = CORPORATE_DESIGN.spacing.large;
    const maxWidth = bounds.width - padding * 2;

    // Quotation marks
    if (params.showQuotationMarks) {
      ctx.font = `${params.fontSize * 1.5}px ${params.font}`;
      ctx.fillStyle = params.textColor;
      ctx.globalAlpha = 0.3;
      ctx.fillText('„', bounds.x + padding, bounds.y);
      ctx.globalAlpha = 1;
    }

    // Quote text
    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.fillStyle = params.textColor;
    ctx.textAlign = params.align as CanvasTextAlign;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, params.text, maxWidth);
    const lineHeightPx = params.fontSize * 1.3;

    let x: number;
    switch (params.align) {
      case 'left':
        x = bounds.x + padding;
        break;
      case 'right':
        x = bounds.x + bounds.width - padding;
        break;
      default:
        x = bounds.x + bounds.width / 2;
    }

    let y = bounds.y + params.fontSize;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lineHeightPx;
    }

    // Attribution
    if (params.attribution) {
      y += CORPORATE_DESIGN.spacing.small;
      ctx.font = `${params.fontSize * 0.6}px PTSans-Regular`;
      ctx.fillText(`— ${params.attribution}`, x, y);
      y += params.fontSize * 0.6;
    }

    return true;
  }
});

/**
 * Pure quote style (zitat_pure) - italic GrueneTypeNeue with quote mark SVG
 */
registerComponent('text-quote-pure', {
  category: 'text',
  description: 'Pure quote style (zitat_pure) - italic GrueneTypeNeue with quote mark SVG',
  parameters: {
    text: { type: 'string', required: true },
    attribution: { type: 'string', default: null },
    textColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    quoteMarkColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    quoteFontSize: { type: 'number', default: 95 },
    nameFontSize: { type: 'number', default: 42 }
  },
  render: async (ctx, params, bounds) => {
    const margin = 75;
    const textWidth = bounds.width - (margin * 2);
    const quoteMarkSize = 100;

    // Position quotation marks in upper left (matching zitat_pure)
    const quoteMarkX = bounds.x + margin;
    const quoteMarkY = bounds.y + 200;

    // Try to load quote SVG, fallback to text if not available
    const quoteSvgPath = path.join(__dirname, '../../../public/quote.svg');
    if (fs.existsSync(quoteSvgPath)) {
      try {
        const quotationMark = await loadImage(quoteSvgPath);
        ctx.drawImage(quotationMark, quoteMarkX, quoteMarkY, quoteMarkSize, quoteMarkSize);
      } catch (err) {
        // Fallback to text quote mark
        ctx.font = `italic ${quoteMarkSize}px GrueneTypeNeue`;
        ctx.fillStyle = params.quoteMarkColor;
        ctx.globalAlpha = 0.5;
        ctx.fillText('„', quoteMarkX, quoteMarkY + quoteMarkSize * 0.8);
        ctx.globalAlpha = 1;
      }
    } else {
      // Fallback to text quote mark
      ctx.font = `italic ${quoteMarkSize}px GrueneTypeNeue`;
      ctx.fillStyle = params.quoteMarkColor;
      ctx.globalAlpha = 0.5;
      ctx.fillText('„', quoteMarkX, quoteMarkY + quoteMarkSize * 0.8);
      ctx.globalAlpha = 1;
    }

    // Position main quote text at Y=320 (matching zitat_pure)
    let currentY = bounds.y + 320;
    const lineHeight = params.quoteFontSize * 1.2;

    // Render Quote Text (italic)
    ctx.font = `italic ${params.quoteFontSize}px GrueneTypeNeue`;
    ctx.fillStyle = params.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Wrap text
    const quoteLines = wrapText(ctx, params.text, textWidth);
    quoteLines.forEach((line, index) => {
      const textY = currentY + (index * lineHeight);
      ctx.fillText(line, bounds.x + margin, textY);
    });

    // Calculate position for author name: after all quote lines + gap
    const totalQuoteHeight = quoteLines.length * lineHeight;
    const nameY = currentY + totalQuoteHeight + 40;

    // Render Author Name (italic, smaller, left-aligned)
    if (params.attribution) {
      ctx.font = `italic ${params.nameFontSize}px GrueneTypeNeue`;
      ctx.fillStyle = params.textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(params.attribution, bounds.x + margin, nameY);
    }

    return true;
  }
});
