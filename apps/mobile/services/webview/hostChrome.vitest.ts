import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  embeddedSurfaceShape,
  hostDrawsEditorBar,
  hostDrawsHeader,
  SELF_CHROMED_PATH_PREFIXES,
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
  '/studio/vorlage/': ['apps/web/src/features/vorlagen/SharepicVorlageInstantiatePage.tsx'],
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

describe('hostDrawsEditorBar', () => {
  it('draws the native bar for the canvas editor and the Vorlage hand-off only', () => {
    expect(hostDrawsEditorBar('/studio/canvas/abc')).toBe(true);
    expect(hostDrawsEditorBar('/studio/vorlage/abc?mitBeitrag=1')).toBe(true);
    expect(hostDrawsEditorBar('/boards/abc')).toBe(false);
    expect(hostDrawsEditorBar('/notebooks/abc')).toBe(false);
  });

  it('does not let a neighbouring path borrow the prefix', () => {
    expect(hostDrawsEditorBar('/studio/canvas-archiv/abc')).toBe(false);
  });

  it('only for surfaces that also keep a bar of their own for older binaries', () => {
    for (const path of ['/studio/canvas/abc', '/studio/vorlage/abc']) {
      expect(hostDrawsHeader(path)).toBe(false);
    }
  });
});

/**
 * The loading skeleton draws whatever this returns. A new self-chromed surface
 * that nobody gave a shape would quietly get a spinner over an empty screen —
 * the exact state the skeletons were added to remove — so the two lists are
 * tied together here rather than trusted to stay in step.
 */
describe('embeddedSurfaceShape', () => {
  it('gives every self-chromed surface a shape', () => {
    for (const prefix of SELF_CHROMED_PATH_PREFIXES) {
      expect(embeddedSurfaceShape(`${prefix}abc-123`), `${prefix} has no skeleton`).not.toBeNull();
    }
  });

  it('names them apart — the three do not look alike', () => {
    expect(embeddedSurfaceShape('/boards/abc')).toBe('board');
    expect(embeddedSurfaceShape('/office/abc')).toBe('office');
    expect(embeddedSurfaceShape('/studio/canvas/abc')).toBe('canvas');
    expect(embeddedSurfaceShape('/studio/vorlage/abc')).toBe('canvas');
  });

  it('promises nothing for a page whose layout it does not know', () => {
    expect(embeddedSurfaceShape('/notebooks/abc')).toBeNull();
    expect(embeddedSurfaceShape('/texte/abc')).toBeNull();
    expect(embeddedSurfaceShape('/gruenerator/mein-agent')).toBeNull();
    expect(embeddedSurfaceShape('/datenbank/vorlagen?selected=abc')).toBeNull();
    expect(embeddedSurfaceShape('')).toBeNull();
  });

  it('judges by the pathname, and does not let a neighbour borrow the prefix', () => {
    expect(embeddedSurfaceShape('/boards/abc?tab=archiv')).toBe('board');
    expect(embeddedSurfaceShape('/boards-admin/abc')).toBeNull();
    expect(embeddedSurfaceShape('/studio/canvas-archiv/abc')).toBeNull();
  });
});
