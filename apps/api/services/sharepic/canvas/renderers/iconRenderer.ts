/**
 * Icon Renderer
 * Renders React Icons using server-side rendering with caching
 * Supports multiple icon libraries via dynamic imports
 */

import {
  loadImage,
  type SKRSContext2D as CanvasRenderingContext2D,
  type Image,
} from '@napi-rs/canvas';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createLogger } from '../../../../utils/logger.js';

import type { IconLayer } from '../types/freeCanvasTypes.js';

const log = createLogger('iconRenderer');

const iconCache = new Map<string, string>();

/**
 * Dynamically import icon component from library
 * @param iconId - Format: "{library}-{name}" e.g. "pi-heartfill"
 * @returns Icon component or null if not found
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getIconComponent(iconId: string): Promise<((...args: any[]) => any) | null> {
  const [library, iconName] = iconId.split('-');

  if (!iconName) {
    log.warn(`Invalid icon ID format: ${iconId}`);
    return null;
  }

  const pascalCaseName = iconName.charAt(0).toUpperCase() + iconName.slice(1);

  // Icon libraries export named components dynamically - need Record access
  const getFromModule = (mod: Record<string, unknown>, key: string) =>
    (mod[key] as ((...args: unknown[]) => unknown) | undefined) ?? null;

  try {
    switch (library) {
      case 'pi': {
        const piIcons = await import('react-icons/pi');
        return getFromModule(piIcons as Record<string, unknown>, `Pi${pascalCaseName}`);
      }
      case 'fa': {
        const faIcons = await import('react-icons/fa');
        return getFromModule(faIcons as Record<string, unknown>, `Fa${pascalCaseName}`);
      }
      case 'hi': {
        const hiIcons = await import('react-icons/hi');
        return getFromModule(hiIcons as Record<string, unknown>, `Hi${pascalCaseName}`);
      }
      case 'md': {
        const mdIcons = await import('react-icons/md');
        return getFromModule(mdIcons as Record<string, unknown>, `Md${pascalCaseName}`);
      }
      case 'io': {
        const ioIcons = await import('react-icons/io5');
        return getFromModule(ioIcons as Record<string, unknown>, `Io${pascalCaseName}`);
      }
      default:
        log.warn(`Unsupported icon library: ${library}`);
        return null;
    }
  } catch (error) {
    log.warn(`Failed to load icon ${iconId}:`, (error as Error).message);
    return null;
  }
}

/**
 * Render an icon layer with React SSR and caching
 * @param ctx - Canvas 2D context
 * @param icon - Icon layer configuration
 */
export async function renderIcon(ctx: CanvasRenderingContext2D, icon: IconLayer): Promise<void> {
  const cacheKey = `${icon.iconId}-${icon.size}-${icon.color}`;

  let svgString = iconCache.get(cacheKey);

  if (!svgString) {
    const IconComponent = await getIconComponent(icon.iconId);

    if (!IconComponent) {
      log.warn(`Icon not found: ${icon.iconId}. Skipping.`);
      return;
    }

    svgString = renderToStaticMarkup(
      createElement(IconComponent, {
        size: icon.size,
        color: icon.color,
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
