import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  embeddedSurfaceShape,
  fallbackTitle,
  headerKind,
  SELF_CHROMED_PATH_PREFIXES,
} from './hostChrome';

describe('headerKind', () => {
  it('draws the editor bar for the editors', () => {
    expect(headerKind('/studio/canvas/abc-123')).toBe('editor');
    expect(headerKind('/studio/vorlage/abc?mitBeitrag=1')).toBe('editor');
    expect(headerKind('/boards/abc-123')).toBe('editor');
    expect(headerKind('/office/abc-123')).toBe('editor');
  });

  it('draws the plain bar everywhere else', () => {
    expect(headerKind('/notebooks/abc-123')).toBe('plain');
    expect(headerKind('/texte/abc-123')).toBe('plain');
    expect(headerKind('/gruenerator/mein-agent')).toBe('plain');
    expect(headerKind('/documents/abc-123')).toBe('plain');
    expect(headerKind('')).toBe('plain');
    expect(headerKind('/')).toBe('plain');
  });

  it('judges by the pathname, not by the query string', () => {
    expect(headerKind('/datenbank/vorlagen?selected=abc')).toBe('plain');
    expect(headerKind('/boards/abc?tab=archiv')).toBe('editor');
  });

  it('does not let a neighbouring path borrow the prefix', () => {
    // The trailing slash is what separates `/boards/` from `/boards-admin`.
    expect(headerKind('/boards-admin/abc')).toBe('plain');
    expect(headerKind('/office-intern/abc')).toBe('plain');
    expect(headerKind('/studio/canvas-archiv/abc')).toBe('plain');
  });
});

describe('fallbackTitle', () => {
  it('names the editor until the page reports a title', () => {
    expect(fallbackTitle('/studio/vorlage/abc')).toBe('Sharepic');
    expect(fallbackTitle('/office/abc')).toBe('Dokument');
    expect(fallbackTitle('/boards/abc')).toBe('Board');
    expect(fallbackTitle('/notebooks/abc')).toBe('Web');
  });
});

/**
 * App binaries from before the native editor bar draw no header on these
 * surfaces, so the page's own bar is their only way out — on iOS the only one at
 * all.
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
