/**
 * Icon Renderer
 * Renders React Icons using server-side rendering with caching
 * Supports multiple icon libraries via dynamic imports
 */

import { loadImage, type CanvasRenderingContext2D, type Image } from 'canvas';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { IconLayer } from '../types/freeCanvasTypes.js';

const iconCache = new Map<string, string>();

/**
 * Dynamically import icon component from library
 * @param iconId - Format: "{library}-{name}" e.g. "pi-heartfill"
 * @returns Icon component or null if not found
 */
async function getIconComponent(iconId: string): Promise<any | null> {
  const [library, iconName] = iconId.split('-');

  if (!iconName) {
    console.warn(`Invalid icon ID format: ${iconId}`);
    return null;
  }

  const pascalCaseName = iconName.charAt(0).toUpperCase() + iconName.slice(1);

  try {
    switch (library) {
      case 'pi': {
        const piIcons = await import('react-icons/pi');
        return (piIcons as any)[`Pi${pascalCaseName}`] || null;
      }
      case 'fa': {
        const faIcons = await import('react-icons/fa');
        return (faIcons as any)[`Fa${pascalCaseName}`] || null;
      }
      case 'hi': {
        const hiIcons = await import('react-icons/hi');
        return (hiIcons as any)[`Hi${pascalCaseName}`] || null;
      }
      case 'md': {
        const mdIcons = await import('react-icons/md');
        return (mdIcons as any)[`Md${pascalCaseName}`] || null;
      }
      case 'io': {
        const ioIcons = await import('react-icons/io5');
        return (ioIcons as any)[`Io${pascalCaseName}`] || null;
      }
      default:
        console.warn(`Unsupported icon library: ${library}`);
        return null;
    }
  } catch (error) {
    console.warn(`Failed to load icon ${iconId}:`, (error as Error).message);
    return null;
  }
}

/**
 * Render an icon layer with React SSR and caching
 * @param ctx - Canvas 2D context
 * @param icon - Icon layer configuration
 */
export async function renderIcon(
  ctx: CanvasRenderingContext2D,
  icon: IconLayer
): Promise<void> {
  const cacheKey = `${icon.iconId}-${icon.size}-${icon.color}`;

  let svgString = iconCache.get(cacheKey);

  if (!svgString) {
    const IconComponent = await getIconComponent(icon.iconId);

    if (!IconComponent) {
      console.warn(`Icon not found: ${icon.iconId}. Skipping.`);
      return;
    }

    svgString = renderToStaticMarkup(
      createElement(IconComponent, {
        size: icon.size,
        color: icon.color
      })
    );

    iconCache.set(cacheKey, svgString);
  }

  const iconImage: Image = await loadImage(Buffer.from(svgString));

  ctx.save();

  ctx.translate(icon.x, icon.y);
  ctx.rotate((icon.rotation * Math.PI) / 180);
  ctx.globalAlpha = icon.opacity;

  ctx.drawImage(iconImage, -icon.size / 2, -icon.size / 2, icon.size, icon.size);

  ctx.restore();
}
