/**
 * Font Manager for Remotion
 *
 * Manages font loading and paths for video rendering
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { FontDefinition, FontLoadResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const FONTS_DIR = path.resolve(__dirname, '../../public/fonts');

export const fontDefinitions: FontDefinition[] = [
  {
    family: 'GrueneTypeNeue',
    file: 'GrueneTypeNeue-Regular.ttf',
    weight: '400'
  },
  {
    family: 'GrueneType Neue',
    file: 'GrueneTypeNeue-Regular.ttf',
    weight: '400'
  },
  {
    family: 'PTSans',
    file: 'PTSans-Regular.ttf',
    weight: '400'
  },
  {
    family: 'PT Sans',
    file: 'PTSans-Regular.ttf',
    weight: '400'
  },
  {
    family: 'PTSans',
    file: 'PTSans-Bold.ttf',
    weight: '700'
  },
  {
    family: 'GJFontRegular',
    file: 'GJFontRegular.ttf',
    weight: '400'
  },
  {
    family: 'Wix Madefor Display',
    file: 'GJFontRegular.ttf',
    weight: '400'
  },
  {
    family: 'Montserrat',
    file: 'Montserrat-Bold.ttf',
    weight: '700'
  }
];

export async function loadAllFonts(): Promise<FontLoadResult> {
  const fontPaths = getAllFontPaths();
  const results: Array<{ path: string; success: boolean }> = [];

  for (const fontPath of fontPaths) {
    const { default: fs } = await import('fs/promises');
    try {
      await fs.access(fontPath);
      results.push({ path: fontPath, success: true });
    } catch {
      results.push({ path: fontPath, success: false });
    }
  }

  const loaded = results.filter(r => r.success).map(r => r.path);
  const failed = results.filter(r => !r.success).map(r => r.path);

  if (failed.length > 0) {
    console.warn('Some font files not found:', failed);
  }

  return { loaded, failed };
}

export function getFontPath(fontFamily: string): string {
  const font = fontDefinitions.find(f => f.family === fontFamily);
  if (font) {
    return path.join(FONTS_DIR, font.file);
  }
  return path.join(FONTS_DIR, 'GrueneTypeNeue-Regular.ttf');
}

export function getAllFontPaths(): string[] {
  const uniqueFiles = [...new Set(fontDefinitions.map(f => f.file))];
  return uniqueFiles.map(file => path.join(FONTS_DIR, file));
}
