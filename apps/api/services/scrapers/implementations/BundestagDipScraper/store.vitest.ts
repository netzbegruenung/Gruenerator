import { describe, expect, it } from 'vitest';

import { PROMPT_SOURCE_MAX_CHARS } from '../../../document-services/TextChunker/chunkBudget.js';

import { buildDrucksacheParent, buildProtokollParent, dipPointId } from './builders.js';
import { prepareParentPoints, upsertBatches } from './store.js';

const sentence = (i: number) =>
  `Satz ${i}: Die Bundesregierung muss beim Klimaschutz endlich liefern und die Wärmewende sozial gerecht gestalten.`;
const longSpeech = Array.from({ length: 60 }, (_, i) => sentence(i)).join(' ');

const parent = buildProtokollParent(
  { id: '5806', dokumentnummer: '21/90', wahlperiode: 21, datum: '2026-07-10' },
  [
    {
      speaker: 'Katharina Dröge',
      party: 'GRÜNE',
      text: longSpeech,
      speechType: 'rede',
      isGovernment: false,
    },
    {
      speaker: 'Tino Chrupalla',
      party: 'AfD',
      text: 'Frau Kollegin, sind Sie nicht auch der Meinung, dass die Bürger andere Sorgen haben?',
      speechType: 'zwischenfrage',
      isGovernment: false,
    },
  ],
  'hash-1'
);

describe('prepareParentPoints', async () => {
  const points = await prepareParentPoints(parent);
  const rede = points.filter((p) => p.payload.document_id === 'rede:5806:0');
  const frage = points.filter((p) => p.payload.document_id === 'rede:5806:1');

  it('teilt eine lange Rede so, dass jeder Chunk ungekürzt in den Antwort-Prompt passt', () => {
    expect(longSpeech.length).toBeGreaterThan(4000);
    expect(rede.length).toBeGreaterThan(2);
    for (const p of rede) {
      expect(String(p.payload.chunk_text).length).toBeLessThanOrEqual(PROMPT_SOURCE_MAX_CHARS);
    }
  });

  it('zählt chunk_index je Einheit ab 0 — die Facetten zählen nur Kopf-Chunks', () => {
    expect(rede.map((p) => p.payload.chunk_index)).toEqual(rede.map((_, i) => i));
    expect(frage.map((p) => p.payload.chunk_index)).toEqual([0]);
  });

  it('trägt Überschriftenpfad, Facetten und Volltext-Hash in jeden Punkt', () => {
    for (const p of points) {
      expect(p.payload).toMatchObject({
        parent_id: 'protokoll:5806',
        content_hash: 'hash-1',
        content_type: 'rede',
        wahlperiode: '21',
        chunk_type: 'text',
      });
    }
    expect(frage[0].payload).toMatchObject({
      heading_path: ['Plenarprotokoll 21/90', 'Tino Chrupalla'],
      party: ['AfD'],
      section_type: 'zwischenfrage',
    });
    expect(frage[0].id).toBe(dipPointId('rede:5806:1', 0));
  });

  it('legt den Text der Einheit als full_text auf ihren Kopf-Chunk', () => {
    expect(frage[0].payload.full_text).toBe(parent.units[1].text);
    expect(rede.slice(1).every((p) => !('full_text' in p.payload))).toBe(true);
  });

  it('bettet Titel und Pfad mit ein, speichert aber den rohen Text', () => {
    expect(frage[0].embedText).toContain('Rede von Tino Chrupalla (AfD)');
    expect(frage[0].payload.chunk_text).not.toContain('Rede von');
  });
});

describe('prepareParentPoints — Drucksache mit Gliederung', async () => {
  const body = (topic: string) =>
    Array.from(
      { length: 12 },
      (_, i) => `${topic} ${i}: Die Regelung schützt Mieterinnen und Mieter vor überhöhten Mieten.`
    ).join('\n');
  const parent = buildDrucksacheParent(
    {
      id: '1',
      dokumentnummer: '21/4268',
      drucksachetyp: 'Gesetzentwurf',
      wahlperiode: 21,
      datum: '2026-02-24',
      titel: 'Mietrecht',
      urheber: [],
    },
    [
      {
        sectionType: 'begruendung_allgemein',
        title: 'Begründung – Allgemeiner Teil',
        text: `# I. Zielsetzung\n${body('Ziel')}\n# II. Wesentlicher Inhalt\n${body('Inhalt')}`,
      },
    ],
    null
  );
  const points = await prepareParentPoints(parent);

  it('hängt die Gliederung an den Pfad der Einheit an', () => {
    const paths = points.map((p) => (p.payload.heading_path as string[]).join(' › '));
    expect(paths).toContain(
      'Gesetzentwurf 21/4268 › Begründung – Allgemeiner Teil › I. Zielsetzung'
    );
    expect(paths).toContain(
      'Gesetzentwurf 21/4268 › Begründung – Allgemeiner Teil › II. Wesentlicher Inhalt'
    );
  });
});

describe('upsertBatches', () => {
  const point = (chars: number) => ({ payload: { full_text: 'x'.repeat(chars) } });

  it('teilt nach höchstens zehn Punkten', () => {
    expect(upsertBatches(Array.from({ length: 23 }, () => point(10))).map((b) => b.length)).toEqual(
      [10, 10, 3]
    );
  });

  it('hält große Kopf-Chunks unter dem Body-Limit des Proxys', () => {
    const sizes = upsertBatches([point(200_000), point(200_000), point(10), point(10)]).map(
      (b) => b.length
    );
    expect(sizes).toEqual([1, 3]);
  });
});
