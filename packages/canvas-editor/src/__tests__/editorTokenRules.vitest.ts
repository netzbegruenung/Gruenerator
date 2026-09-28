import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Die Editor-Oberfläche färbt sich nur über `--editor-*`-Token (siehe
 * packages/canvas-editor/CLAUDE.md). `dark:` schaltet in den beiden Builds
 * verschieden: in apps/web nur bei `data-theme="dark"`, im Paket-Bundle nur
 * über `prefers-color-scheme`. Kein ESLint-Regelwerk prüft Tailwind-Klassen,
 * deshalb bewacht dieser Test die Quelle (#3766).
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HIER, '..');
const REPO = path.resolve(SRC, '../../..');

const DARK_UTILITY = /(^|[\s'"`])(?:[\w-]+:)*!?dark:/;

function quelldateien(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((eintrag) => {
    const voll = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) return eintrag.name === '__tests__' ? [] : quelldateien(voll);
    return /\.tsx?$/.test(eintrag.name) && !/\.vitest\.tsx?$/.test(eintrag.name) ? [voll] : [];
  });
}

function editorTokenNamen(datei: string): string[] {
  const css = readFileSync(path.join(REPO, datei), 'utf8');
  return [...new Set([...css.matchAll(/(--editor-[a-z0-9-]+):/g)].map((t) => t[1]!))].sort();
}

function themeMapping(datei: string): string[] {
  const css = readFileSync(path.join(REPO, datei), 'utf8');
  return [...css.matchAll(/--color-(editor-[a-z0-9-]+):\s*var\(--\1\)/g)]
    .map((t) => `--${t[1]}`)
    .sort();
}

describe('Editor-Token-Regeln', () => {
  it('erkennt dark:-Klassen überhaupt', () => {
    // Ohne diese Zusicherung wäre der Test nach einem Regex-Umbau blind.
    for (const probe of [
      "'bg-grey-100 dark:bg-grey-800'",
      '"dark:!text-x"',
      'hover:x dark:hover:y',
    ]) {
      expect(DARK_UTILITY.test(probe)).toBe(true);
    }
    expect(DARK_UTILITY.test('darkPreviewClass: x')).toBe(false);
  });

  it('keine dark:-Utilities in src/', () => {
    const dateien = quelldateien(SRC);
    expect(dateien.length).toBeGreaterThan(100);
    const treffer = dateien.flatMap((datei) =>
      readFileSync(datei, 'utf8')
        .split('\n')
        .flatMap((zeile, i) =>
          DARK_UTILITY.test(zeile) ? [`${path.relative(SRC, datei)}:${i + 1}`] : []
        )
    );
    expect(treffer).toEqual([]);
  });

  it('dieselben --editor-* Token in allen vier Token-Dateien', () => {
    const web = editorTokenNamen('apps/web/src/assets/styles/common/variables.css');
    const paket = editorTokenNamen('packages/canvas-editor/src/styles/variables.css');
    expect(web.length).toBeGreaterThan(20);
    expect(paket).toEqual(web);

    // Nicht jedes Token ist eine Farbe (Höhe, Verlauf) — das Mapping ist eine
    // Teilmenge, muss aber in beiden @theme-Blöcken gleich sein.
    const webTheme = themeMapping('apps/web/src/assets/styles/index.css');
    const paketTheme = themeMapping('packages/canvas-editor/src/styles/tailwind-input.css');
    expect(paketTheme).toEqual(webTheme);
    expect(webTheme.filter((t) => !web.includes(t))).toEqual([]);
  });
});
