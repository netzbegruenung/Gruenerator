import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hostDrawsHeader, SELF_CHROMED_PATH_PREFIXES } from './hostChrome';

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
