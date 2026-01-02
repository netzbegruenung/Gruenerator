import fs from 'fs/promises';
import { registerFont } from 'canvas';
import { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH, SUNFLOWER_PATH } from './config.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('fileManagement');

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
    { path: SUNFLOWER_PATH, name: 'Sonnenblumen-Bild' }
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
  const fonts: FontConfig[] = [
    { path: FONT_PATH, family: 'GrueneTypeNeue', name: 'GrueneTypeNeue' },
    { path: PTSANS_REGULAR_PATH, family: 'PTSans-Regular', name: 'PTSans Regular' },
    { path: PTSANS_BOLD_PATH, family: 'PTSans-Bold', name: 'PTSans Bold' }
  ];

  for (const font of fonts) {
    try {
      registerFont(font.path, { family: font.family });
    } catch (err) {
      log.error(`Fehler beim Registrieren der ${font.name} Schriftart:`, err);
      throw err;
    }
  }
}
