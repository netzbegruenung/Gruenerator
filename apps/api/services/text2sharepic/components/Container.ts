/**
 * Container Components
 *
 * Layout containers for organizing and grouping content
 */

import { registerComponent, CORPORATE_DESIGN } from '../ComponentRegistry.js';

/**
 * Card container with background and padding
 */
registerComponent('container-card', {
  category: 'container',
  description: 'Card container with background and padding',
  parameters: {
    backgroundColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    opacity: { type: 'number', default: 0.9 },
    padding: { type: 'number', default: 40 },
    borderRadius: { type: 'number', default: 0 }
  },
  render: async (ctx, params, bounds) => {
    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = params.opacity;
    ctx.fillStyle = params.backgroundColor;

    if (params.borderRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, params.borderRadius);
      ctx.fill();
    } else {
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    ctx.globalAlpha = oldAlpha;

    return true;
  }
});
