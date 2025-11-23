/**
 * Component Library for Text2Sharepic
 *
 * Manages reusable visual components for dynamic sharepic generation.
 * Components are self-contained rendering units with parameters and constraints.
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH, COLORS } = require('../../routes/sharepic/sharepic_canvas/config');

// Register fonts on module load
try {
  registerFont(FONT_PATH, { family: 'GrueneTypeNeue' });
  if (fs.existsSync(PTSANS_REGULAR_PATH)) {
    registerFont(PTSANS_REGULAR_PATH, { family: 'PTSans-Regular' });
  }
  if (fs.existsSync(PTSANS_BOLD_PATH)) {
    registerFont(PTSANS_BOLD_PATH, { family: 'PTSans-Bold' });
  }
} catch (err) {
  console.warn('[ComponentLibrary] Font registration warning:', err.message);
}

/**
 * Corporate Design constants
 */
const CORPORATE_DESIGN = {
  colors: {
    tanne: '#005538',
    klee: '#008939',
    grashalm: '#8ABD24',
    sand: '#F5F1E9',
    white: '#FFFFFF',
    black: '#000000',
    zitatBg: '#6ccd87',
    ...COLORS
  },
  fonts: {
    primary: 'GrueneTypeNeue',
    secondary: 'PTSans-Regular',
    secondaryBold: 'PTSans-Bold'
  },
  spacing: {
    small: 20,
    medium: 40,
    large: 60,
    xlarge: 80
  }
};

/**
 * Component Registry
 * Each component has: type, render function, parameter schema, constraints
 */
const componentRegistry = new Map();

/**
 * Register a component in the library
 */
function registerComponent(type, definition) {
  componentRegistry.set(type, {
    type,
    ...definition,
    registeredAt: Date.now()
  });
  console.log(`[ComponentLibrary] Registered component: ${type}`);
}

/**
 * Get a component definition by type
 */
function getComponent(type) {
  return componentRegistry.get(type);
}

/**
 * List all available components
 */
function listComponents() {
  return Array.from(componentRegistry.entries()).map(([type, def]) => ({
    type,
    description: def.description,
    parameters: def.parameters,
    category: def.category
  }));
}

// =============================================================================
// BACKGROUND COMPONENTS
// =============================================================================

registerComponent('background-solid', {
  category: 'background',
  description: 'Solid color background',
  parameters: {
    color: { type: 'color', default: CORPORATE_DESIGN.colors.tanne, required: true }
  },
  render: async (ctx, params, bounds) => {
    ctx.fillStyle = params.color;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
});

registerComponent('background-gradient', {
  category: 'background',
  description: 'Linear gradient background',
  parameters: {
    colorStart: { type: 'color', default: CORPORATE_DESIGN.colors.tanne, required: true },
    colorEnd: { type: 'color', default: CORPORATE_DESIGN.colors.klee, required: true },
    direction: { type: 'enum', values: ['vertical', 'horizontal', 'diagonal'], default: 'vertical' }
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
  }
});

registerComponent('background-image', {
  category: 'background',
  description: 'Image background',
  parameters: {
    imagePath: { type: 'string', required: true },
    fit: { type: 'enum', values: ['cover', 'contain', 'stretch'], default: 'cover' }
  },
  render: async (ctx, params, bounds) => {
    const imgPath = path.join(__dirname, '../../public', params.imagePath);

    if (!fs.existsSync(imgPath)) {
      console.warn(`[ComponentLibrary] Image not found: ${imgPath}`);
      ctx.fillStyle = CORPORATE_DESIGN.colors.tanne;
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      return;
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
  }
});

// =============================================================================
// TEXT COMPONENTS
// =============================================================================

registerComponent('text-headline', {
  category: 'text',
  description: 'Large headline text',
  parameters: {
    text: { type: 'string', required: true },
    color: { type: 'color', default: CORPORATE_DESIGN.colors.white },
    fontSize: { type: 'number', min: 40, max: 200, default: 90 },
    font: { type: 'enum', values: ['GrueneTypeNeue', 'PTSans-Bold'], default: 'GrueneTypeNeue' },
    align: { type: 'enum', values: ['left', 'center', 'right'], default: 'center' },
    maxWidth: { type: 'number', default: null },
    lineHeight: { type: 'number', default: 1.2 }
  },
  render: async (ctx, params, bounds) => {
    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.fillStyle = params.color;
    ctx.textAlign = params.align;
    ctx.textBaseline = 'top';

    const maxWidth = params.maxWidth || bounds.width - CORPORATE_DESIGN.spacing.medium * 2;
    const lines = wrapText(ctx, params.text, maxWidth);
    const lineHeightPx = params.fontSize * params.lineHeight;

    let x;
    switch (params.align) {
      case 'left': x = bounds.x + CORPORATE_DESIGN.spacing.medium; break;
      case 'right': x = bounds.x + bounds.width - CORPORATE_DESIGN.spacing.medium; break;
      default: x = bounds.x + bounds.width / 2;
    }

    let y = bounds.y;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lineHeightPx;
    }

    return { renderedHeight: y - bounds.y };
  }
});

registerComponent('text-body', {
  category: 'text',
  description: 'Body text with multi-line support',
  parameters: {
    text: { type: 'string', required: true },
    color: { type: 'color', default: CORPORATE_DESIGN.colors.white },
    fontSize: { type: 'number', min: 20, max: 80, default: 36 },
    font: { type: 'enum', values: ['GrueneTypeNeue', 'PTSans-Regular', 'PTSans-Bold'], default: 'PTSans-Regular' },
    align: { type: 'enum', values: ['left', 'center', 'right'], default: 'left' },
    maxWidth: { type: 'number', default: null },
    lineHeight: { type: 'number', default: 1.4 }
  },
  render: async (ctx, params, bounds) => {
    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.fillStyle = params.color;
    ctx.textAlign = params.align;
    ctx.textBaseline = 'top';

    const maxWidth = params.maxWidth || bounds.width - CORPORATE_DESIGN.spacing.medium * 2;
    const lines = wrapText(ctx, params.text, maxWidth);
    const lineHeightPx = params.fontSize * params.lineHeight;

    let x;
    switch (params.align) {
      case 'left': x = bounds.x + CORPORATE_DESIGN.spacing.medium; break;
      case 'right': x = bounds.x + bounds.width - CORPORATE_DESIGN.spacing.medium; break;
      default: x = bounds.x + bounds.width / 2;
    }

    let y = bounds.y;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lineHeightPx;
    }

    return { renderedHeight: y - bounds.y };
  }
});

registerComponent('text-quote', {
  category: 'text',
  description: 'Quote text with optional attribution',
  parameters: {
    text: { type: 'string', required: true },
    attribution: { type: 'string', default: null },
    textColor: { type: 'color', default: CORPORATE_DESIGN.colors.white },
    fontSize: { type: 'number', min: 30, max: 100, default: 50 },
    font: { type: 'enum', values: ['GrueneTypeNeue', 'PTSans-Regular'], default: 'GrueneTypeNeue' },
    showQuotationMarks: { type: 'boolean', default: true },
    align: { type: 'enum', values: ['left', 'center', 'right'], default: 'center' }
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
    ctx.textAlign = params.align;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, params.text, maxWidth);
    const lineHeightPx = params.fontSize * 1.3;

    let x;
    switch (params.align) {
      case 'left': x = bounds.x + padding; break;
      case 'right': x = bounds.x + bounds.width - padding; break;
      default: x = bounds.x + bounds.width / 2;
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

    return { renderedHeight: y - bounds.y + padding };
  }
});

/**
 * Zitat Pure style quote component - matches zitat_pure_canvas.js exactly
 */
registerComponent('text-quote-pure', {
  category: 'text',
  description: 'Pure quote style (zitat_pure) - italic GrueneTypeNeue with quote mark SVG',
  parameters: {
    text: { type: 'string', required: true },
    attribution: { type: 'string', default: null },
    textColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    quoteMarkColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    quoteFontSize: { type: 'number', min: 60, max: 120, default: 95 },
    nameFontSize: { type: 'number', min: 30, max: 60, default: 42 }
  },
  render: async (ctx, params, bounds) => {
    const margin = 75;
    const textWidth = bounds.width - (margin * 2);
    const quoteMarkSize = 100;

    // Position quotation marks in upper left (matching zitat_pure)
    const quoteMarkX = bounds.x + margin;
    const quoteMarkY = bounds.y + 200;

    // Try to load quote SVG, fallback to text if not available
    const quoteSvgPath = path.join(__dirname, '../../public/quote.svg');
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

    return {
      renderedHeight: nameY + params.nameFontSize - bounds.y
    };
  }
});

// =============================================================================
// DECORATION COMPONENTS
// =============================================================================

registerComponent('decoration-sunflower', {
  category: 'decoration',
  description: 'Green sunflower watermark (top-right corner, subtle)',
  parameters: {
    opacity: { type: 'number', min: 0, max: 0.2, default: 0.06 }
  },
  render: async (ctx, params, bounds) => {
    const sunflowerPath = path.join(__dirname, '../../public/sonnenblume_dunkelgruen.svg');

    if (!fs.existsSync(sunflowerPath)) {
      console.warn('[ComponentLibrary] Green sunflower SVG not found:', sunflowerPath);
      return;
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
  }
});

registerComponent('decoration-bar', {
  category: 'decoration',
  description: 'Colored bar element',
  parameters: {
    color: { type: 'color', default: CORPORATE_DESIGN.colors.klee },
    height: { type: 'number', min: 5, max: 100, default: 20 },
    width: { type: 'enum', values: ['full', 'half', 'quarter'], default: 'full' },
    position: { type: 'enum', values: ['top', 'middle', 'bottom'], default: 'bottom' },
    opacity: { type: 'number', min: 0, max: 1, default: 1 }
  },
  render: async (ctx, params, bounds) => {
    let width;
    switch (params.width) {
      case 'half': width = bounds.width / 2; break;
      case 'quarter': width = bounds.width / 4; break;
      default: width = bounds.width;
    }

    let y;
    switch (params.position) {
      case 'top': y = bounds.y; break;
      case 'middle': y = bounds.y + bounds.height / 2 - params.height / 2; break;
      default: y = bounds.y + bounds.height - params.height;
    }

    const x = bounds.x + (bounds.width - width) / 2;

    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = params.opacity;
    ctx.fillStyle = params.color;
    ctx.fillRect(x, y, width, params.height);
    ctx.globalAlpha = oldAlpha;
  }
});

registerComponent('decoration-shape', {
  category: 'decoration',
  description: 'Basic shapes (circle, rectangle)',
  parameters: {
    shape: { type: 'enum', values: ['circle', 'rectangle', 'rounded-rectangle'], default: 'circle' },
    color: { type: 'color', default: CORPORATE_DESIGN.colors.klee },
    size: { type: 'number', min: 20, max: 500, default: 100 },
    opacity: { type: 'number', min: 0, max: 1, default: 0.5 },
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
      case 'rounded-rectangle':
        const radius = params.size * 0.1;
        ctx.beginPath();
        ctx.roundRect(x, y, params.size, params.size, radius);
        ctx.fill();
        break;
      default:
        ctx.fillRect(x, y, params.size, params.size);
    }

    ctx.globalAlpha = oldAlpha;
  }
});

// =============================================================================
// BALKEN COMPONENTS (Dreizeilen style) - matches dreizeilen_canvas.js exactly
// =============================================================================

/**
 * Single text balken - exactly matching dreizeilen_canvas.js style
 * Angle: 12°, Height factor: 1.6, Padding factor: 0.3
 */
registerComponent('text-balken', {
  category: 'text',
  description: 'Parallelogram text bar (Grüne style) with 12° angled edges - single balken for headers',
  parameters: {
    text: { type: 'string', required: true },
    backgroundColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    textColor: { type: 'color', default: CORPORATE_DESIGN.colors.sand },
    fontSize: { type: 'number', min: 30, max: 120, default: 85 },
    font: { type: 'enum', values: ['GrueneTypeNeue', 'PTSans-Bold'], default: 'GrueneTypeNeue' },
    angle: { type: 'number', min: 0, max: 20, default: 12 },
    paddingFactor: { type: 'number', min: 0.1, max: 1, default: 0.3 },
    heightFactor: { type: 'number', min: 1.2, max: 2, default: 1.6 },
    align: { type: 'enum', values: ['left', 'center', 'right'], default: 'center' },
    offsetX: { type: 'number', default: 0 }
  },
  render: async (ctx, params, bounds) => {
    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const textWidth = ctx.measureText(params.text).width;
    const padding = params.fontSize * params.paddingFactor;
    const balkenHeight = params.fontSize * params.heightFactor;
    const balkenWidth = Math.min(textWidth + padding * 2 + 20, bounds.width - 20);

    // Calculate X position based on alignment
    let x;
    switch (params.align) {
      case 'left':
        x = Math.max(10, bounds.x + 10 + params.offsetX);
        break;
      case 'right':
        x = Math.min(bounds.x + bounds.width - balkenWidth - 10 + params.offsetX, bounds.x + bounds.width - balkenWidth - 10);
        break;
      default: // center
        x = Math.max(10, Math.min(bounds.x + bounds.width - balkenWidth - 10,
          bounds.x + (bounds.width - balkenWidth) / 2 + params.offsetX));
    }

    const y = bounds.y;
    const angleRad = params.angle * Math.PI / 180;
    const skewOffset = (balkenHeight * Math.tan(angleRad)) / 2;

    // Draw parallelogram (Balken shape) - exact dreizeilen style
    const points = [
      { x: x, y: y + balkenHeight },
      { x: x + balkenWidth - skewOffset, y: y + balkenHeight },
      { x: x + balkenWidth + skewOffset, y: y },
      { x: x + skewOffset, y: y }
    ];

    ctx.fillStyle = params.backgroundColor;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
    ctx.fill();

    // Draw text centered in balken
    ctx.fillStyle = params.textColor;
    const textX = x + balkenWidth / 2;
    const textY = y + balkenHeight / 2;
    ctx.fillText(params.text, textX, textY);

    return {
      renderedHeight: balkenHeight,
      balkenWidth,
      x,
      y
    };
  }
});

/**
 * Three-line Balken group - exactly matching dreizeilen_canvas.js
 * Default offsets: [50, -100, 50] for staggered effect
 * Colors: TANNE/SAND/TANNE alternating
 */
registerComponent('text-balken-group', {
  category: 'text',
  description: 'Group of 3 Balken (dreizeilen style) with staggered positioning',
  parameters: {
    lines: { type: 'array', default: [] },
    colors: { type: 'array', default: null },
    fontSize: { type: 'number', min: 30, max: 120, default: 85 },
    font: { type: 'enum', values: ['GrueneTypeNeue', 'PTSans-Bold'], default: 'GrueneTypeNeue' },
    angle: { type: 'number', min: 0, max: 20, default: 12 },
    spacing: { type: 'number', min: 0, max: 50, default: 0 },
    offsetX: { type: 'array', default: [50, -100, 50] },
    groupOffsetX: { type: 'number', default: 30 },
    groupOffsetY: { type: 'number', default: 80 }
  },
  render: async (ctx, params, bounds) => {
    const activeLines = params.lines.filter(line => line && line.trim());
    if (activeLines.length === 0) return { renderedHeight: 0 };

    ctx.font = `${params.fontSize}px ${params.font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const balkenHeight = params.fontSize * 1.6;
    const totalHeight = balkenHeight * activeLines.length + params.spacing * (activeLines.length - 1);

    // Center vertically in bounds with +80px offset (matching dreizeilen)
    let startY = bounds.y + (bounds.height - totalHeight) / 2 + params.groupOffsetY;
    startY = Math.max(startY, bounds.y + 100);

    // Default colors matching dreizeilen: TANNE/SAND/TANNE with appropriate text colors
    const defaultColors = [
      { background: CORPORATE_DESIGN.colors.tanne, text: CORPORATE_DESIGN.colors.sand },
      { background: CORPORATE_DESIGN.colors.sand, text: CORPORATE_DESIGN.colors.tanne },
      { background: CORPORATE_DESIGN.colors.tanne, text: CORPORATE_DESIGN.colors.sand }
    ];
    const colors = params.colors || defaultColors;

    const angleRad = params.angle * Math.PI / 180;
    const balkenPositions = [];

    activeLines.forEach((lineText, index) => {
      const textWidth = ctx.measureText(lineText).width;
      const padding = params.fontSize * 0.3;
      const balkenWidth = Math.min(textWidth + padding * 2 + 20, bounds.width - 20);

      const offsetX = (params.offsetX[index] || 0) + params.groupOffsetX;
      const x = Math.max(10, Math.min(bounds.width - balkenWidth - 10,
        bounds.x + (bounds.width - balkenWidth) / 2 + offsetX));
      const y = startY + (balkenHeight + params.spacing) * index;

      balkenPositions.push({ x, y, width: balkenWidth, height: balkenHeight });

      const skewOffset = (balkenHeight * Math.tan(angleRad)) / 2;

      // Draw parallelogram - exact dreizeilen style
      const points = [
        { x: x, y: y + balkenHeight },
        { x: x + balkenWidth - skewOffset, y: y + balkenHeight },
        { x: x + balkenWidth + skewOffset, y: y },
        { x: x + skewOffset, y: y }
      ];

      const colorSet = colors[index] || colors[index % colors.length];
      ctx.fillStyle = colorSet.background;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.lineTo(points[3].x, points[3].y);
      ctx.closePath();
      ctx.fill();

      // Draw text
      ctx.fillStyle = colorSet.text;
      ctx.fillText(lineText, x + balkenWidth / 2, y + balkenHeight / 2);
    });

    return {
      renderedHeight: totalHeight,
      balkenPositions
    };
  }
});

// =============================================================================
// CONTAINER COMPONENTS
// =============================================================================

registerComponent('container-card', {
  category: 'container',
  description: 'Card container with background and padding',
  parameters: {
    backgroundColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    opacity: { type: 'number', min: 0, max: 1, default: 0.9 },
    padding: { type: 'number', min: 0, max: 100, default: 40 },
    borderRadius: { type: 'number', min: 0, max: 50, default: 0 }
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

    // Return inner bounds for child components
    return {
      innerBounds: {
        x: bounds.x + params.padding,
        y: bounds.y + params.padding,
        width: bounds.width - params.padding * 2,
        height: bounds.height - params.padding * 2
      }
    };
  }
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Wrap text to fit within maxWidth
 */
function wrapText(ctx, text, maxWidth) {
  const lines = [];

  // First split by explicit newlines
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Render a component with given parameters
 */
async function renderComponent(ctx, componentType, params, bounds) {
  const component = getComponent(componentType);

  if (!component) {
    console.warn(`[ComponentLibrary] Unknown component: ${componentType}`);
    return null;
  }

  // Merge defaults with provided params
  const mergedParams = { ...component.parameters };
  for (const [key, schema] of Object.entries(component.parameters)) {
    mergedParams[key] = params[key] !== undefined ? params[key] : schema.default;
  }

  try {
    return await component.render(ctx, mergedParams, bounds);
  } catch (error) {
    console.error(`[ComponentLibrary] Error rendering ${componentType}:`, error);
    return null;
  }
}

/**
 * Get corporate design constants
 */
function getCorporateDesign() {
  return { ...CORPORATE_DESIGN };
}

module.exports = {
  registerComponent,
  getComponent,
  listComponents,
  renderComponent,
  getCorporateDesign,
  wrapText,
  CORPORATE_DESIGN
};
