import { existsSync } from 'node:fs';
import path from 'node:path';

import { PRINT_VORLAGEN } from '@gruenerator/canvas-editor/print-vorlagen';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = path.resolve(__dirname, '../../../../public');
const file = (url: string) => path.join(PUBLIC_DIR, url);

describe('print Vorlagen thumbnails', () => {
  it.each(PRINT_VORLAGEN.map((v) => [v.id, v] as const))('%s has its thumbnail files', (_id, v) => {
    expect(existsSync(file(v.thumb)), v.thumb).toBe(true);
    // Business cards are printed on both sides: the back is `<id>-2.webp`.
    if (v.spec.produkt === 'visitenkarte') {
      expect(existsSync(file(v.thumb.replace(/\.webp$/, '-2.webp'))), `${v.thumb} back`).toBe(true);
    }
  });
});
