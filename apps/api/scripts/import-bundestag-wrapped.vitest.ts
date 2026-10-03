import { describe, expect, it } from 'vitest';

import { documentParent, parseArgs, protocolParent } from './import-bundestag-wrapped.js';

describe('protocolParent', () => {
  it('setzt geteilte Reden aus ihren Teilen zusammen und kürzt die Fraktion', () => {
    const parent = protocolParent('5806', [
      // Reihenfolge der Quelle ist beliebig.
      {
        protokoll_id: 5806,
        dokumentnummer: '21/90',
        wahlperiode: 21,
        datum: '2026-07-10',
        chunk_index: 1,
        chunk_part: 1,
        speaker: 'Katharina Dröge',
        speaker_party: 'GRÜNE',
        speech_type: 'rede',
        text: 'Zweiter Teil.',
      },
      {
        protokoll_id: 5806,
        dokumentnummer: '21/90',
        wahlperiode: 21,
        datum: '2026-07-10',
        chunk_index: 1,
        chunk_part: 0,
        speaker: 'Katharina Dröge',
        speaker_party: 'GRÜNE',
        speech_type: 'rede',
        text: 'Erster Teil.',
      },
      {
        protokoll_id: 5806,
        dokumentnummer: '21/90',
        wahlperiode: 21,
        datum: '2026-07-10',
        chunk_index: 0,
        speaker: 'Friedrich Merz',
        speaker_party: 'CDU/CSU',
        speech_type: 'rede',
        is_government: true,
        text: 'Regierungserklärung.',
      },
    ]);

    expect(parent.parentId).toBe('protokoll:5806');
    expect(parent.contentHash).toBeNull();
    expect(parent.units.map((u) => [u.speaker, u.text, u.party])).toEqual([
      ['Friedrich Merz', 'Regierungserklärung.', ['CDU/CSU']],
      ['Katharina Dröge', 'Erster Teil. Zweiter Teil.', ['GRÜNE']],
    ]);
    expect(parent.units[0].isGovernment).toBe(true);
  });
});

describe('documentParent', () => {
  it('fügt „(Teil n)"-Abschnitte zusammen und nimmt Fraktionen aus den Urhebern', () => {
    const head = {
      drucksache_id: 1,
      dokumentnummer: '21/4268',
      drucksachetyp: 'Gesetzentwurf',
      wahlperiode: 21,
      datum: '2026-02-24',
      titel: 'Mietrecht',
      urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN'],
    };
    const parent = documentParent('1', [
      {
        ...head,
        chunk_index: 0,
        chunk_type: 'problem',
        section_title: 'A. Problem',
        text: 'Mieten steigen.',
      },
      {
        ...head,
        chunk_index: 1,
        chunk_part: 0,
        chunk_type: 'artikel',
        section_title: 'Artikel 1 (Teil 1)',
        text: 'Erster Teil.',
      },
      {
        ...head,
        chunk_index: 2,
        chunk_part: 1,
        chunk_type: 'artikel',
        section_title: 'Artikel 1 (Teil 2)',
        text: 'Zweiter Teil.',
      },
    ]);

    expect(parent.units.map((u) => [u.sectionType, u.headingPath[1], u.text])).toEqual([
      ['problem', 'A. Problem', 'Mieten steigen.'],
      ['artikel', 'Artikel 1', 'Erster Teil. Zweiter Teil.'],
    ]);
    expect(parent.units[0].party).toEqual(['GRÜNE']);
  });
});

describe('parseArgs', () => {
  it('lehnt unbekannte Argumente ab, statt einen Tippfehler in --dry-run zu schlucken', () => {
    expect(() => parseArgs(['--source-url', 'http://x', '--dryrun'])).toThrow(
      /Unbekanntes Argument/
    );
  });

  it('verlangt die Quelle', () => {
    expect(() => parseArgs(['--dry-run'])).toThrow(/Usage/);
  });
});
