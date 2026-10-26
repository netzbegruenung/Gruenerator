/**
 * Die Hausschriften kommen aus INTERN_CONTENT_DIR. Fehlt der Checkout (CI,
 * lokal ohne Klon), muss das Sharepic-Rendering in der Ersatzschrift
 * weiterlaufen statt mit einem 500er. Hält zugleich fest, dass
 * `GlobalFonts.registerFromPath` eine fehlende Datei falsy quittiert: würfe es,
 * reichte `registerFonts` den Fehler weiter.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const root = mkdtempSync(path.join(tmpdir(), 'intern-leer-'));
vi.mock('../../skills/internalPrompts.js', () => ({ internContentRoot: () => root }));

const { checkFiles, registerFonts } = await import('./fileManagement.js');

it('keeps rendering without the brand fonts', async () => {
  expect(() => registerFonts()).not.toThrow();
  await expect(checkFiles()).resolves.toBeUndefined();
});
