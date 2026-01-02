/**
 * Background Components
 *
 * Solid, gradient, and image background components for sharepics
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
 * Solid color background
 */
registerComponent('background-solid', {
  category: 'background',
  description: 'Solid color background',
  parameters: {
    color: { type: 'color', default: CORPORATE_DESIGN.colors.tanne, required: true }
  },
  render: async (ctx, params, bounds) => {
    ctx.fillStyle = params.color;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }
});

/**
 * Linear gradient background
 */
registerComponent('background-gradient', {
  category: 'background',
  description: 'Linear gradient background',
  parameters: {
    colorStart: { type: 'color', default: CORPORATE_DESIGN.colors.tanne, required: true },
    colorEnd: { type: 'color', default: CORPORATE_DESIGN.colors.klee, required: true },
    direction: { type: 'string', default: 'vertical' }
  },
  render: async (ctx, params, bounds) => {
    let gradient;
    switch (params.direction) {
      case 'horizontal':
        gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y);
        break;
      case 'diagonal':
        gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
        break;
      default: // vertical
        gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height);
    }
    gradient.addColorStop(0, params.colorStart);
    gradient.addColorStop(1, params.colorEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }
});

/**
 * Image background
 */
registerComponent('background-image', {
  category: 'background',
  description: 'Image background',
  parameters: {
    imagePath: { type: 'string', required: true },
    fit: { type: 'string', default: 'cover' }
  },
  render: async (ctx, params, bounds) => {
    const imgPath = path.join(__dirname, '../../../public', params.imagePath);

    if (!fs.existsSync(imgPath)) {
      console.warn(`[ComponentLibrary] Image not found: ${imgPath}`);
      ctx.fillStyle = CORPORATE_DESIGN.colors.tanne;
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      return true;
    }

    const img = await loadImage(imgPath);

    // Calculate fit dimensions
    let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;
    if (params.fit === 'cover') {
      const imageRatio = img.width / img.height;
      const boundsRatio = bounds.width / bounds.height;

      if (imageRatio > boundsRatio) {
        sWidth = img.height * boundsRatio;
        sx = (img.width - sWidth) / 2;
      } else {
        sHeight = img.width / boundsRatio;
        sy = (img.height - sHeight) / 2;
      }
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }
});
