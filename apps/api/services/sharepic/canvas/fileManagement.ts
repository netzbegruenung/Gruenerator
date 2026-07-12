import fs from 'fs/promises';

import { GlobalFonts } from '@napi-rs/canvas';

import { createLogger } from '../../../utils/logger.js';

import {
  FONT_PATH,
  PTSANS_REGULAR_PATH,
  PTSANS_BOLD_PATH,
  SUNFLOWER_PATH,
  GOTHAM_ULTRA_PATH,
  GOTHAM_BOOK_PATH,
  GOTHAM_BOLD_PATH,
  VOLLKORN_ITALIC_PATH,
} from './config.js';

const log = createLogger('fileManagement');

let fontsRegistered = false;

interface FileConfig {
  path: string;
  name: string;
}

interface FontConfig {
  path: string;
  family: string;
  name: string;
}

export async function checkFiles(): Promise<void> {
  const files: FileConfig[] = [
    { path: FONT_PATH, name: 'GrueneTypeNeue Schriftartdatei' },
    { path: PTSANS_REGULAR_PATH, name: 'PTSans Regular Schriftartdatei' },
    { path: PTSANS_BOLD_PATH, name: 'PTSans Bold Schriftartdatei' },
    { path: SUNFLOWER_PATH, name: 'Sonnenblumen-Bild' },
  ];

  for (const file of files) {
    try {
      await fs.access(file.path);
    } catch (err) {
      log.error(`Fehler beim Zugriff auf ${file.name}:`, err);
      throw new Error(`${file.name} nicht gefunden: ${file.path}`);
    }
  }
}

export function registerFonts(): void {
  if (fontsRegistered) {
    return;
  }

  const fonts: FontConfig[] = [
    { path: FONT_PATH, family: 'GrueneTypeNeue', name: 'GrueneTypeNeue' },
    { path: PTSANS_REGULAR_PATH, family: 'PTSans-Regular', name: 'PTSans Regular' },
    { path: PTSANS_BOLD_PATH, family: 'PTSans-Bold', name: 'PTSans Bold' },
    // Österreich (de-AT) — Gotham Narrow + Vollkorn (CI 2026)
    { path: GOTHAM_ULTRA_PATH, family: 'GothamNarrow-Ultra', name: 'Gotham Narrow Ultra' },
    { path: GOTHAM_BOOK_PATH, family: 'GothamNarrow-Book', name: 'Gotham Narrow Book' },
    { path: GOTHAM_BOLD_PATH, family: 'GothamNarrow-Bold', name: 'Gotham Narrow Bold' },
    { path: VOLLKORN_ITALIC_PATH, family: 'Vollkorn', name: 'Vollkorn Italic' },
  ];

  for (const font of fonts) {
    try {
      GlobalFonts.registerFromPath(font.path, font.family);
    } catch (err) {
      log.error(`Fehler beim Registrieren der ${font.name} Schriftart:`, err);
      throw err;
    }
  }

  fontsRegistered = true;
  log.debug('All fonts registered successfully');
}
