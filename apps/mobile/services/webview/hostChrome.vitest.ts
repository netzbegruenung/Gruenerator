import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CANVAS_MENUBAR_GRADIENT,
  CANVAS_MENUBAR_GRADIENT_STOPS,
  hostDrawsHeader,
  SELF_CHROMED_PATH_PREFIXES,
  statusBarTint,
} from './hostChrome';

describe('hostDrawsHeader', () => {
  it('stands back where the page brings its own bar', () => {
    expect(hostDrawsHeader('/studio/canvas/abc-123')).toBe(false);
    expect(hostDrawsHeader('/boards/abc-123')).toBe(false);
    expect(hostDrawsHeader('/office/abc-123')).toBe(false);
  });

  it('keeps its header where nothing else leaves the screen', () => {
    // These four have no back button of their own in embedded mode. Without the
    // host header the WebView would be a room without a door.
    expect(hostDrawsHeader('/notebooks/abc-123')).toBe(true);
    expect(hostDrawsHeader('/texte/abc-123')).toBe(true);
    expect(hostDrawsHeader('/gruenerator/mein-agent')).toBe(true);
    expect(hostDrawsHeader('/documents/abc-123')).toBe(true);
  });

  it('judges by the pathname, not by the query string', () => {
    expect(hostDrawsHeader('/datenbank/vorlagen?selected=abc')).toBe(true);
    expect(hostDrawsHeader('/boards/abc?tab=archiv')).toBe(false);
  });

  it('does not let a neighbouring path borrow the prefix', () => {
    // The trailing slash is what separates `/boards/` from `/boards-admin`.
    expect(hostDrawsHeader('/boards-admin/abc')).toBe(true);
    expect(hostDrawsHeader('/office-intern/abc')).toBe(true);
  });

  it('falls back to drawing the header for an empty or unknown path', () => {
    expect(hostDrawsHeader('')).toBe(true);
    expect(hostDrawsHeader('/')).toBe(true);
  });
});

/**
 * The dangerous half of the decision. Hiding the host header for a surface that
 * has no way out of its own leaves the user pinned on a page with nothing but
 * Android's hardware back — and on iOS, nothing at all.
 *
 * So each entry is tied to the web file that draws its bar, and the file must
 * still call `useHostAwareBack` (the hook whose embedded branch posts `CLOSE`).
 * Deleting or renaming that call — the way a back button quietly disappears —
 * fails here rather than in the field.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const WAY_OUT: Record<string, readonly string[]> = {
  '/boards/': ['apps/web/src/features/boards/components/BoardInlineHeader.tsx'],
  '/office/': [
    'apps/web/src/features/sheets/SheetsEditorPage.tsx',
    'apps/web/src/features/docs/DocsEditorPage.tsx',
    'apps/web/src/features/presentations/PresentationsEditorPage.tsx',
  ],
  '/studio/canvas/': ['apps/web/src/features/image-studio/CollabCanvasStudioPage.tsx'],
};

describe('every self-chromed surface has a way out', () => {
  it('names one for each prefix', () => {
    expect(Object.keys(WAY_OUT).sort()).toEqual([...SELF_CHROMED_PATH_PREFIXES].sort());
  });

  it.each(Object.entries(WAY_OUT).flatMap(([prefix, files]) => files.map((f) => [prefix, f])))(
    '%s — %s calls useHostAwareBack',
    (_prefix, file) => {
      const absolute = path.join(REPO_ROOT, file);
      expect(fs.existsSync(absolute), `${file} is gone — the prefix has to go with it`).toBe(true);
      expect(fs.readFileSync(absolute, 'utf8')).toContain('useHostAwareBack(');
    }
  );
});

describe('statusBarTint', () => {
  it('tints only the canvas band', () => {
    expect(statusBarTint('/studio/canvas/abc')).toEqual(CANVAS_MENUBAR_GRADIENT);
    expect(statusBarTint('/boards/abc')).toBeNull();
    expect(statusBarTint('/office/abc')).toBeNull();
    expect(statusBarTint('/notebooks/abc')).toBeNull();
  });

  it('judges by the pathname', () => {
    expect(statusBarTint('/studio/canvas/abc?page=2')).toEqual(CANVAS_MENUBAR_GRADIENT);
    expect(statusBarTint('/studio/canvas-archiv/abc')).toBeNull();
  });
});

/**
 * The gradient is a web design token wearing a second hat. Redesign the editor
 * menu bar and the band above it would keep the old colours — a seam nobody
 * notices in a diff, because the two values live in different languages in
 * different packages. So the CSS is read here and compared.
 */
describe('the canvas band matches the editor menu bar', () => {
  const CSS = path.join(REPO_ROOT, 'packages/canvas-editor/src/styles/variables.css');

  it('parses the same stops out of variables.css', () => {
    const css = fs.readFileSync(CSS, 'utf8');

    const deepGreen = /--editor-green-deep:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    const gradient = /--editor-menubar-gradient:\s*linear-gradient\(([^;]*)\);/.exec(css)?.[1];
    expect(deepGreen, 'variables.css no longer declares --editor-green-deep').toBeDefined();
    expect(gradient, 'variables.css no longer declares --editor-menubar-gradient').toBeDefined();

    // `90deg, var(--editor-green-deep) 0%, #3E7D63 55%, #6BA88C 100%`
    const [angle, ...stops] = (gradient as string).split(',').map((part) => part.trim());
    expect(angle, 'the bar is no longer a left-to-right gradient').toBe('90deg');

    const colours = stops.map((stop) =>
      (stop.split(/\s+/)[0] ?? '').replace('var(--editor-green-deep)', deepGreen as string)
    );
    const positions = stops.map(
      (stop) => Number((stop.split(/\s+/)[1] ?? '').replace('%', '')) / 100
    );

    expect(colours.map((c) => c.toUpperCase())).toEqual(
      CANVAS_MENUBAR_GRADIENT.map((c) => c.toUpperCase())
    );
    expect(positions).toEqual([...CANVAS_MENUBAR_GRADIENT_STOPS]);
  });
});
