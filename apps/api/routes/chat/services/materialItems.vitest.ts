import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  appendTurnMaterial,
  renderTurnMaterial,
  replaceFileItems,
  setTurnMaterial,
  withTurnPaste,
} from './materialItems.js';

import type { TurnMaterialItem } from '../../../agents/langgraph/ChatGraph/types.js';

const upload = (name: string, text: string): TurnMaterialItem => ({
  kind: 'upload',
  name,
  heading: `${name} (Volltext-Auszug)`,
  text,
});

describe('renderTurnMaterial', () => {
  it('rendert ohne Material nichts', () => {
    expect(renderTurnMaterial([])).toBeNull();
  });

  // Die Formen, die die Erzeuger vorher von Hand zusammensetzten — Byte für Byte.
  it('setzt Client-Kontext, Dateien, Referenzen und Sharepic wie bisher zusammen', () => {
    const items: TurnMaterialItem[] = [
      { kind: 'client', text: 'Editor-Inhalt' },
      upload('a.pdf', 'Text A'),
      { kind: 'paste', name: 'Eingefügter Text.txt', heading: 'Eingefügt', text: 'Termine' },
      { kind: 'reference', heading: 'REFERENZIERTE DOKUMENTE', text: 'Doku' },
      { kind: 'reference', heading: 'REFERENZIERTE TEXTE', text: 'Alt' },
      { kind: 'sharepic', text: '## SHAREPIC\n\nStand' },
    ];
    expect(renderTurnMaterial(items)).toBe(
      'Editor-Inhalt' +
        '\n\n---\n\n### a.pdf (Volltext-Auszug)\n\nText A' +
        '\n\n---\n\n### Eingefügt\n\nTermine' +
        '\n\n---\n\n## REFERENZIERTE DOKUMENTE\n\nDoku' +
        '\n\n---\n\n## REFERENZIERTE TEXTE\n\nAlt' +
        '\n\n## SHAREPIC\n\nStand'
    );
  });

  it('beginnt mit dem Sharepic ohne Trenner, wenn sonst nichts da ist', () => {
    expect(renderTurnMaterial([{ kind: 'sharepic', text: 'S' }])).toBe('S');
  });
});

describe('setTurnMaterial / appendTurnMaterial', () => {
  it('hält Liste und Text zusammen', () => {
    const state = {
      attachmentContext: null as string | null,
      turnMaterial: [] as TurnMaterialItem[],
    };
    appendTurnMaterial(state, upload('a.pdf', 'A'));
    appendTurnMaterial(state, { kind: 'reference', heading: 'REFERENZIERTE TEXTE', text: 'T' });
    expect(state.turnMaterial).toHaveLength(2);
    expect(state.attachmentContext).toBe(renderTurnMaterial(state.turnMaterial));
    setTurnMaterial(state, []);
    expect(state.attachmentContext).toBeNull();
  });
});

describe('replaceFileItems', () => {
  const client: TurnMaterialItem = { kind: 'client', text: 'C' };
  const ref: TurnMaterialItem = { kind: 'reference', heading: 'REFERENZIERTE TEXTE', text: 'R' };

  it('ersetzt nur die Dateien und lässt den Rest an seinem Platz', () => {
    const small = upload('klein.txt', 'k');
    expect(
      replaceFileItems([client, upload('gross.pdf', 'g'), upload('klein.txt', 'k'), ref], [small])
    ).toEqual([client, small, ref]);
  });

  it('lässt Referenzen stehen, wenn alle Dateien vektorisiert sind', () => {
    expect(replaceFileItems([client, upload('gross.pdf', 'g'), ref], [])).toEqual([client, ref]);
  });
});

/**
 * Wer `attachmentContext` direkt zuweist, entkoppelt den Text von der Liste —
 * dann zählen Budget, Anker und Dublettenprüfung etwas anderes, als im Prompt
 * steht. Der Wächter liest den Quelltext von `apps/api`.
 */
describe('Schreibweg von attachmentContext', () => {
  it('weist attachmentContext nur in materialItems.ts zu', () => {
    const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.'))
          continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts') || /\.(vitest|test|d)\.ts$/.test(entry.name)) continue;
        if (entry.name === 'materialItems.ts') continue;
        const source = readFileSync(path, 'utf8');
        if (/\.attachmentContext\s*=(?!=)/.test(source)) offenders.push(relative(apiRoot, path));
      }
    };
    walk(apiRoot);
    expect(offenders).toEqual([]);
  });
});

describe('withTurnPaste (#5431)', () => {
  const PASTE = '## EINGEFÜGTER TEXT\n\n<untrusted_content type="anhang">\n…\n</untrusted_content>';

  it('hängt den Paste als eigenen Textteil an die letzte Nutzernachricht', () => {
    const messages = [
      { role: 'user', content: 'Format: Datum, Ort' },
      { role: 'assistant', content: 'Schick mir die Termine' },
      { role: 'user', content: 'Hier sind die Termine' },
    ];
    const out = withTurnPaste(messages, PASTE);
    expect(out[2].content).toEqual([
      { type: 'text', text: 'Hier sind die Termine' },
      { type: 'text', text: PASTE },
    ]);
    expect(out.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(messages[2].content).toBe('Hier sind die Termine');
  });

  it('lässt Bildteile stehen und hängt dahinter an', () => {
    const image = { type: 'image', image: 'AAA', mimeType: 'image/png' };
    const out = withTurnPaste(
      [{ role: 'user', content: [{ type: 'text', text: 'Schau' }, image] }],
      PASTE
    );
    expect(out[0].content).toEqual([
      { type: 'text', text: 'Schau' },
      image,
      { type: 'text', text: PASTE },
    ]);
  });

  it('ohne Paste bleibt die Liste dieselbe', () => {
    const messages = [{ role: 'user', content: 'Hallo' }];
    expect(withTurnPaste(messages, null)).toBe(messages);
  });
});
