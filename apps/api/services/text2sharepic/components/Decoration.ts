/**
 * Decoration Components
 *
 * Decorative elements like sunflowers, bars, and shapes for sharepics
 */

import { loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { registerComponent, CORPORATE_DESIGN } from '../ComponentRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Green sunflower watermark (top-right corner, subtle)
 */
registerComponent('decoration-sunflower', {
  category: 'decoration',
  description: 'Green sunflower watermark (top-right corner, subtle)',
  parameters: {
    opacity: { type: 'number', default: 0.06 }
  },
  render: async (ctx, params, bounds) => {
    const sunflowerPath = path.join(__dirname, '../../../public/sonnenblume_dunkelgruen.svg');

    if (!fs.existsSync(sunflowerPath)) {
      console.warn('[ComponentLibrary] Green sunflower SVG not found:', sunflowerPath);
      return true;
    }

    const img = await loadImage(sunflowerPath);

    // Large watermark size matching zitat_pure_canvas.js
    const size = 800;
    // Position: top-right corner, cropped/bleeding off edges
    const x = bounds.width - 800 + 200;  // Bleeds off right edge
    const y = -200;                       // Bleeds off top edge

    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = params.opacity;
    ctx.drawImage(img, x, y, size, size);
    ctx.globalAlpha = oldAlpha;

    return true;
  }
});

/**
 * Colored bar element
 */
registerComponent('decoration-bar', {
  category: 'decoration',
  description: 'Colored bar element',
  parameters: {
    color: { type: 'color', default: CORPORATE_DESIGN.colors.klee },
    height: { type: 'number', default: 20 },
    width: { type: 'string', default: 'full' },
    position: { type: 'string', default: 'bottom' },
    opacity: { type: 'number', default: 1 }
  },
  render: async (ctx, params, bounds) => {
    let width: number;
    switch (params.width) {
      case 'half':
        width = bounds.width / 2;
        break;
      case 'quarter':
        width = bounds.width / 4;
        break;
      default:
        width = bounds.width;
    }

    let y: number;
    switch (params.position) {
      case 'top':
        y = bounds.y;
        break;
      case 'middle':
        y = bounds.y + bounds.height / 2 - params.height / 2;
        break;
      default:
        y = bounds.y + bounds.height - params.height;
    }

    const x = bounds.x + (bounds.width - width) / 2;

    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = params.opacity;
    ctx.fillStyle = params.color;
    ctx.fillRect(x, y, width, params.height);
    ctx.globalAlpha = oldAlpha;

    return true;
  }
});

/**
 * Basic shapes (circle, rectangle)
 */
registerComponent('decoration-shape', {
  category: 'decoration',
  description: 'Basic shapes (circle, rectangle)',
  parameters: {
    shape: { type: 'string', default: 'circle' },
    color: { type: 'color', default: CORPORATE_DESIGN.colors.klee },
    size: { type: 'number', default: 100 },
    opacity: { type: 'number', default: 0.5 },
    x: { type: 'number', default: 0 },
    y: { type: 'number', default: 0 }
  },
  render: async (ctx, params, bounds) => {
    const x = bounds.x + params.x;
    const y = bounds.y + params.y;

    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = params.opacity;
    ctx.fillStyle = params.color;

    switch (params.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(x + params.size / 2, y + params.size / 2, params.size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rounded-rectangle': {
        const radius = params.size * 0.1;
        ctx.beginPath();
        ctx.roundRect(x, y, params.size, params.size, radius);
        ctx.fill();
        break;
      }
      default:
        ctx.fillRect(x, y, params.size, params.size);
    }

    ctx.globalAlpha = oldAlpha;

    return true;
  }
});
