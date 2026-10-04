import { describe, expect, it } from 'vitest';

import { renumberPageMarkers } from '../../parliament/pageText.js';

import {
  ausschussOf,
  classifyDocType,
  documentIdOf,
  isExcludedDocType,
  originalPagesOf,
  reachedKnownDocuments,
  speakerName,
  urheberOf,
} from './builders.js';

describe('classifyDocType', () => {
  it.each([
    ['Kleine Anfrage 8844 Kapteinat, Lisa-Kristin SPD', 'Kleine Anfrage'],
    ['Antwort MUNV zu KlAnfr 6961 Drs 18/20669', 'Antwort'],
    ['Antrag auf Aktuelle Stunde SPD', 'Antrag auf Aktuelle Stunde'],
    ['Antrag CDU, GRÜNE', 'Antrag'],
    ['Änderungsantrag CDU, GRÜNE zu GesEntw LRg Drs 18/20443', 'Änderungsantrag'],
    ['Beschlussempfehlung und Bericht IntA', 'Beschlussempfehlung und Bericht'],
    ['Bericht HFA', 'Bericht'],
    ['Berichtigung zu Drs 18/1', 'Berichtigung'],
    ['Große Anfrage 46 AfD', 'Große Anfrage'],
    ['Diverse', 'Diverse'],
    ['Unterrichtung Präs zu Vorl 18/5527', 'Unterrichtung'],
    ['Beratung (öffentlich) zu Antr AfD Drs 18/20422', 'Beratung (öffentlich)'],
    ['Auswärtige Sitzung', 'Auswärtige Sitzung'],
  ])('%s → %s', (descriptor, expected) => {
    expect(classifyDocType(descriptor)).toBe(expected);
  });

  it('does not take a prefix of a longer word', () => {
    // „Gesetz" ist ein Typ, „Gesetzentwurf" der längere — und ein unbekanntes
    // „Gesetzesblatt" darf keiner von beiden werden.
    expect(classifyDocType('Gesetzesblatt 12')).toBe('Gesetzesblatt');
  });

  it('only excludes Kleine Anfragen', () => {
    expect(isExcludedDocType('Kleine Anfrage')).toBe(true);
    expect(isExcludedDocType('Große Anfrage')).toBe(false);
    expect(isExcludedDocType('Antwort')).toBe(false);
  });
});

describe('urheberOf', () => {
  it('reads the factions before the reference, not the referenced Landesregierung', () => {
    expect(
      urheberOf(
        'Änderungsantrag CDU, GRÜNE zu GesEntw LRg Drs 18/20443 Schick, Thorsten u.a. CDU',
        'Änderungsantrag'
      )
    ).toEqual(['CDU', 'GRÜNE']);
  });

  it('attributes answers to the Landesregierung', () => {
    expect(urheberOf('Antwort MUNV zu KlAnfr 6961 Drs 18/20669', 'Antwort')).toEqual([
      'Landesregierung',
    ]);
  });

  it('reads a single faction behind the author names', () => {
    expect(
      urheberOf(
        'Antrag auf Aktuelle Stunde SPD Ott, Jochen; Blumenthal, Ina u.a. SPD',
        'Antrag auf Aktuelle Stunde'
      )
    ).toEqual(['SPD']);
  });

  it('reads a government bill', () => {
    expect(urheberOf('Gesetzentwurf LRg', 'Gesetzentwurf')).toEqual(['Landesregierung']);
  });

  it('finds nobody in a committee report', () => {
    expect(
      urheberOf('Beschlussempfehlung und Bericht IntA', 'Beschlussempfehlung und Bericht')
    ).toEqual([]);
  });
});

describe('ausschussOf', () => {
  it('reads session number and committee abbreviation', () => {
    expect(ausschussOf('17.09.2026 92.AHeiKo S.1, 4')).toEqual({ sitzung: 92, gremium: 'AHEIKO' });
    expect(ausschussOf('10.09.2026 63.ABWD S.1-2, 4-15')).toEqual({ sitzung: 63, gremium: 'ABWD' });
  });

  it('returns null for a trailer without a session', () => {
    expect(ausschussOf('28.09.2026 2 S.')).toBeNull();
  });
});

describe('page numbers of extracts', () => {
  it('maps extract pages onto the original protocol', () => {
    const pages = originalPagesOf([
      { from: 1, to: 2 },
      { from: 4, to: 5 },
    ]);
    expect(pages).toEqual([1, 2, 4, 5]);
    expect(renumberPageMarkers('## Seite 1\n\na\n\n## Seite 3\n\nb', pages)).toBe(
      '## Seite 1\n\na\n\n## Seite 4\n\nb'
    );
  });

  it('leaves whole documents alone', () => {
    expect(originalPagesOf([{ from: 1, to: 0 }])).toBeNull();
    expect(renumberPageMarkers('## Seite 2', null)).toBe('## Seite 2');
  });
});

describe('reachedKnownDocuments', () => {
  it('keeps paging through a page of nothing but new Kleine Anfragen', () => {
    expect(reachedKnownDocuments(Array.from({ length: 50 }, () => 'excluded' as const))).toBe(
      false
    );
  });

  it('keeps paging through new documents and failures', () => {
    expect(reachedKnownDocuments(['stored', 'excluded', undefined, 'empty'])).toBe(false);
  });

  it('stops once the page reaches documents stored by an earlier run', () => {
    expect(reachedKnownDocuments(['stored', 'excluded', 'known'])).toBe(true);
  });
});

describe('small helpers', () => {
  it('strips page references from speakers', () => {
    expect(speakerName('Loose, Christian AfD S. 33 (KInt)')).toBe('Loose, Christian AfD');
    expect(speakerName('Odermatt, Vanessa CDU')).toBe('Odermatt, Vanessa CDU');
  });

  it('builds a stable document id from the record id', () => {
    expect(documentIdOf({ recordId: '1814959/0700' })).toBe('ltnrw-1814959-0700');
  });
});
