/**
 * Balken Components
 *
 * Parallelogram text bars in "dreizeilen" style with angled edges
 */

import { registerComponent, CORPORATE_DESIGN } from '../ComponentRegistry.js';

/**
 * Single text balken - exactly matching dreizeilen_canvas.js style
 * Angle: 12°, Height factor: 1.6, Padding factor: 0.3
 */
registerComponent('text-balken', {
  category: 'balken',
  description: 'Parallelogram text bar (Grüne style) with 12° angled edges - single balken for headers',
  parameters: {
    text: { type: 'string', required: true },
    backgroundColor: { type: 'color', default: CORPORATE_DESIGN.colors.tanne },
    textColor: { type: 'color', default: CORPORATE_DESIGN.colors.sand },
    fontSize: { type: 'number', default: 85 },
    font: { type: 'string', default: 'GrueneTypeNeue' },
    angle: { type: 'number', default: 12 },
    paddingFactor: { type: 'number', default: 0.3 },
    heightFactor: { type: 'number', default: 1.6 },
    align: { type: 'string', default: 'center' },
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
    let x: number;
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

    return true;
  }
});

/**
 * Three-line Balken group - exactly matching dreizeilen_canvas.js
 * Default offsets: [50, -100, 50] for staggered effect
 * Colors: TANNE/SAND/TANNE alternating
 */
registerComponent('text-balken-group', {
  category: 'balken',
  description: 'Group of 3 Balken (dreizeilen style) with staggered positioning',
  parameters: {
    lines: { type: 'array', default: [] },
    colors: { type: 'array', default: null },
    fontSize: { type: 'number', default: 85 },
    font: { type: 'string', default: 'GrueneTypeNeue' },
    angle: { type: 'number', default: 12 },
    spacing: { type: 'number', default: 0 },
    offsetX: { type: 'array', default: [50, -100, 50] },
    groupOffsetX: { type: 'number', default: 30 },
    groupOffsetY: { type: 'number', default: 80 }
  },
  render: async (ctx, params, bounds) => {
    const activeLines = params.lines.filter((line: string) => line && line.trim());
    if (activeLines.length === 0) return true;

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
    const balkenPositions: Array<{ x: number; y: number; width: number; height: number }> = [];

    activeLines.forEach((lineText: string, index: number) => {
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

    return true;
  }
});
