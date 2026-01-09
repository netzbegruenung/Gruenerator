/**
 * Shape Renderer
 * Renders 7 geometric primitive shapes: rect, circle, triangle, star, arrow, heart, cloud
 * Uses canvas path drawing for SVG-like rendering
 */

import type { CanvasRenderingContext2D } from 'canvas';
import type { ShapeLayer } from '../types/freeCanvasTypes.js';

function renderRect(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  ctx.fillRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
}

function renderCircle(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  ctx.beginPath();
  ctx.arc(0, 0, shape.width / 2, 0, Math.PI * 2);
  ctx.fill();
}

function renderTriangle(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const h = shape.height;
  const w = shape.width;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
}

function renderStar(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const spikes = 5;
  const outerRadius = shape.width / 2;
  const innerRadius = outerRadius * 0.4;

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function renderArrow(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const w = shape.width;
  const h = shape.height;
  const shaftWidth = h * 0.3;
  const headWidth = h * 0.6;
  const headLength = w * 0.3;

  ctx.beginPath();
  ctx.moveTo(-w / 2, -shaftWidth / 2);
  ctx.lineTo(w / 2 - headLength, -shaftWidth / 2);
  ctx.lineTo(w / 2 - headLength, -headWidth / 2);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2 - headLength, headWidth / 2);
  ctx.lineTo(w / 2 - headLength, shaftWidth / 2);
  ctx.lineTo(-w / 2, shaftWidth / 2);
  ctx.closePath();
  ctx.fill();
}

function renderHeart(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const w = shape.width;
  const h = shape.height;

  ctx.beginPath();
  ctx.moveTo(0, h * 0.3);

  ctx.bezierCurveTo(-w / 2, -h / 2, -w * 0.8, h * 0.2, 0, h);
  ctx.bezierCurveTo(w * 0.8, h * 0.2, w / 2, -h / 2, 0, h * 0.3);

  ctx.fill();
}

function renderCloud(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const w = shape.width;
  const h = shape.height;

  ctx.beginPath();
  ctx.arc(-w * 0.25, 0, h * 0.3, 0, Math.PI * 2);
  ctx.arc(w * 0.1, -h * 0.15, h * 0.35, 0, Math.PI * 2);
  ctx.arc(w * 0.3, 0, h * 0.25, 0, Math.PI * 2);
  ctx.arc(0, h * 0.1, h * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Render a shape layer with transforms
 * @param ctx - Canvas 2D context
 * @param shape - Shape layer configuration
 */
export function renderShape(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  ctx.save();

  ctx.translate(shape.x, shape.y);
  ctx.rotate((shape.rotation * Math.PI) / 180);
  ctx.scale(shape.scaleX, shape.scaleY);
  ctx.globalAlpha = shape.opacity;
  ctx.fillStyle = shape.fill;

  switch (shape.type) {
    case 'rect':
      renderRect(ctx, shape);
      break;
    case 'circle':
      renderCircle(ctx, shape);
      break;
    case 'triangle':
      renderTriangle(ctx, shape);
      break;
    case 'star':
      renderStar(ctx, shape);
      break;
    case 'arrow':
      renderArrow(ctx, shape);
      break;
    case 'heart':
      renderHeart(ctx, shape);
      break;
    case 'cloud':
      renderCloud(ctx, shape);
      break;
    default:
      console.warn(`Unknown shape type: ${(shape as any).type}`);
  }

  ctx.restore();
}
