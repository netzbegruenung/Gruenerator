import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../skills/internalPrompts.js', () => ({ internContentRoot: () => root }));

async function freshStyleguide() {
  vi.resetModules();
  return import('./styleguide.js');
}

afterEach(() => {
  root = '';
});

describe('styleguide source', () => {
  it('prefers the internal checkout', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'intern-'));
    mkdirSync(path.join(root, 'sharepic-creator/kapitel'), { recursive: true });
    writeFileSync(path.join(root, 'sharepic-creator/kapitel/fotos.md'), 'INTERN fotos\n');
    writeFileSync(
      path.join(root, 'sharepic-creator/beispiele.json'),
      JSON.stringify([{ id: 'x', land: 'de-DE', anlass: 'aufruf', vorbild: 'intern', spec: {} }])
    );

    const { chapterText, loadExamples } = await freshStyleguide();
    expect(chapterText('fotos')).toBe('INTERN fotos');
    expect(loadExamples().map((e) => e.vorbild)).toEqual(['intern']);
  });

  it('falls back to the public copy per file', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'intern-'));
    mkdirSync(path.join(root, 'sharepic-creator/kapitel'), { recursive: true });
    writeFileSync(path.join(root, 'sharepic-creator/kapitel/fotos.md'), 'INTERN fotos');

    const { chapterText, loadExamples } = await freshStyleguide();
    expect(chapterText('fotos')).toBe('INTERN fotos');
    expect(chapterText('texte')).not.toBe('');
    expect(loadExamples().length).toBeGreaterThan(0);
  });

  it('works without any internal checkout', async () => {
    root = path.join(tmpdir(), 'does-not-exist-sharepic');
    const { systemPrompt } = await freshStyleguide();
    expect(systemPrompt('de-AT')).toContain('Die Grünen in Österreich');
  });
});
