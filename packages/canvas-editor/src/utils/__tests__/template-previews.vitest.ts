import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { TEMPLATE_REGISTRY } from '../templateRegistry';

/**
 * Die Vorlagenauswahl lädt `previewImage` als absoluten Pfad aus
 * apps/web/public. Fehlt die Datei, zeigt die Kachel ein kaputtes Bild — und
 * zwar still, weil niemand einen 404 auf ein Vorschaubild bemerkt. Sieben der
 * vierzehn Pfade waren so über Monate tot.
 */
const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../apps/web/public'
);

describe('Vorschaubilder der Vorlagen', () => {
  const entries = Object.entries(TEMPLATE_REGISTRY);

  it.each(entries)('%s hat ein vorhandenes Vorschaubild', (_id, info) => {
    expect(info.previewImage.startsWith('/')).toBe(true);
    const file = path.join(PUBLIC_DIR, info.previewImage);
    expect(existsSync(file), `${info.previewImage} fehlt unter apps/web/public`).toBe(true);
  });
});
