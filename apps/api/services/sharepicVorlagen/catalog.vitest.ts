import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSharepicVorlage,
  listSharepicVorlagen,
  resetSharepicVorlagenCache,
  sharepicVorlageThumbFile,
} from './catalog.js';

let root = '';
vi.mock('../skills/internalPrompts.js', () => ({ internContentRoot: () => root }));

const entry = (id: string, locale: 'de-DE' | 'de-AT', color: string) => ({
  id,
  titel: `Titel ${id}`,
  beschreibung: 'Kurz beschrieben.',
  form: 'einzelbild',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Sharepic zum Radverkehr'] },
  spec: {
    locale,
    slides: [
      {
        background: { kind: 'farbe', color },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'headline', lines: ['Mehr Platz', 'fürs Rad'] }],
        logo: true,
      },
    ],
  },
});

function writeCatalog(files: Record<string, unknown>) {
  root = mkdtempSync(path.join(tmpdir(), 'intern-'));
  mkdirSync(path.join(root, 'sharepic-vorlagen'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, 'sharepic-vorlagen', name), JSON.stringify(content));
  }
}

beforeEach(() => resetSharepicVorlagenCache());

describe('sharepic Vorlagen catalogue', () => {
  it('keeps the countries apart', () => {
    writeCatalog({
      'de.json': [entry('de-rad', 'de-DE', 'tanne')],
      'at.json': [entry('at-rad', 'de-AT', 'dunkelgruen')],
    });
    expect(listSharepicVorlagen('de-DE').map((v) => v.id)).toEqual(['de-rad']);
    expect(listSharepicVorlagen('de-AT').map((v) => v.id)).toEqual(['at-rad']);
    expect(listSharepicVorlagen(null)).toHaveLength(2);
    expect(getSharepicVorlage('at-rad')).toMatchObject({ locale: 'de-AT', attributions: [null] });
  });

  it('skips an entry filed under the wrong country, an invalid one and a duplicate', () => {
    writeCatalog({
      'de.json': [
        entry('de-rad', 'de-DE', 'tanne'),
        entry('falsch', 'de-AT', 'dunkelgruen'),
        { id: 'kaputt' },
        entry('de-rad', 'de-DE', 'mint'),
      ],
    });
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual(['de-rad']);
  });

  it('is empty without the private checkout', () => {
    root = path.join(tmpdir(), 'no-intern-here');
    expect(listSharepicVorlagen(null)).toEqual([]);
    expect(sharepicVorlageThumbFile('de-rad')).toBeNull();
  });

  it('resolves thumbnails only for known ids', () => {
    writeCatalog({ 'de.json': [entry('de-rad', 'de-DE', 'tanne')] });
    expect(sharepicVorlageThumbFile('de-rad')).toBe(
      path.join(root, 'sharepic-vorlagen/thumbs/de-rad.webp')
    );
    expect(sharepicVorlageThumbFile('../../etc/passwd')).toBeNull();
  });
});
