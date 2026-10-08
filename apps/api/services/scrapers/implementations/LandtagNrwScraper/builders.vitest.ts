import { describe, expect, it } from 'vitest';

import { renumberPageMarkers } from '../../parliament/pageText.js';

import {
  ausschussOf,
  bezugOf,
  classifyDocType,
  documentIdOf,
  ergebnisOf,
  filterFieldsOf,
  gremienOf,
  headerTextOf,
  isExcludedDocType,
  originalPagesOf,
  reachedKnownDocuments,
  speakerName,
  speakerOf,
  urheberOf,
} from './builders.js';
import { type LandtagListEntry } from './listParser.js';

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
    expect(ausschussOf('17.09.2026 92.AHeiKo S.1, 4')).toEqual({
      sitzung: 92,
      gremien: ['AHEIKO'],
    });
    expect(ausschussOf('10.09.2026 63.ABWD S.1-2, 4-15')).toEqual({
      sitzung: 63,
      gremien: ['ABWD'],
    });
  });

  it('splits a joint session into one abbreviation per committee', () => {
    expect(ausschussOf('15.09.2026 91.HPA/91.AHK/96.AWIKE S.1')?.gremien).toEqual([
      'HPA',
      'AHK',
      'AWIKE',
    ]);
  });

  it('returns null for a trailer without a session', () => {
    expect(ausschussOf('28.09.2026 2 S.')).toBeNull();
  });
});

describe('gremienOf', () => {
  it.each([
    ['HFA/52.HFA/UAP', ['HFA', 'HFA/UAP']],
    ['IA/70.HFA/39.HFA/UAP', ['IA', 'HFA', 'HFA/UAP']],
    ['HFA/UAP/88.HFA', ['HFA/UAP', 'HFA']],
    ['AHEIKO', ['AHEIKO']],
    ['HFA/UAP', ['HFA/UAP']],
  ])('keeps subcommittees whole: %s', (raw, expected) => {
    expect(gremienOf(raw)).toEqual(expected);
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

describe('speakerOf', () => {
  it.each([
    ['Dr. Korte, Robin GRÜNE S. 30', { name: 'Dr. Robin Korte', party: 'GRÜNE' }],
    ['Tritschler, Sven W. AfD', { name: 'Sven W. Tritschler', party: 'AfD' }],
    ['Reul, Herbert IM', { name: 'Herbert Reul', party: 'Landesregierung' }],
    ['Paul, Josefine (MKJFGFI)', { name: 'Josefine Paul', party: 'Landesregierung' }],
    ['Kuper, André Präs', null],
    ['Gödecke, Carina VizePräs', null],
  ])('%s', (line, expected) => {
    expect(speakerOf(line)).toEqual(expected);
  });
});

describe('ergebnisOf', () => {
  it.each([
    [
      'Seite 2 - Der Antrag - Drucksache 18/123 - wurde mit den Stimmen von CDU und GRÜNE abgelehnt.',
      ['abgelehnt'],
    ],
    [
      'Seite 1 - Zustimmung zu dem Gesetzentwurf mit den Stimmen von CDU und GRÜNE.',
      ['angenommen'],
    ],
    [
      'Der Antrag wurde einstimmig an den Ausschuss für Schule und Bildung überwiesen.',
      ['überwiesen'],
    ],
    ['Seite 160 - Die Abstimmungsergebnisse in Übersicht 41 - wurden bestätigt.', []],
    [null, []],
  ])('%s', (beschluss, expected) => {
    expect(ergebnisOf(beschluss)).toEqual(expected);
  });
});

describe('filterFieldsOf', () => {
  it('finds Kreis and kreisfreie Stadt in a Drucksache, but not the noun „Essen"', () => {
    const regions = (title: string, text = '') =>
      filterFieldsOf({ redner: [], beschluss: null, title, part: 'drucksache', text }).region;
    expect(regions('Schulbau in Detmold')).toEqual(['Kreis Lippe']);
    expect(regions('Kölner Dom und Düsseldorfer Rheinufer')).toEqual(['Düsseldorf', 'Köln']);
    expect(regions('Gesundes Essen in Kitas')).toEqual([]);
    expect(regions('Landschaftsverband Westfalen-Lippe')).toEqual([]);
    expect(regions('Krankenhaus in Hamm')).toEqual(['Hamm']);
    expect(regions('Hammer und Sichel')).toEqual([]);
  });

  it('drops the region when a document names more than four', () => {
    const fields = filterFieldsOf({
      redner: [],
      beschluss: null,
      title: 'Köln, Bonn, Essen-Steele, Dortmund und Münster',
      part: 'drucksache',
      text: '',
    });
    expect(fields.region).toEqual([]);
  });

  it('takes speakers and their faction from the Rednerliste', () => {
    const fields = filterFieldsOf({
      redner: ['Dr. Korte, Robin GRÜNE S. 30', 'Reul, Herbert IM S. 31', 'Kuper, André Präs S. 1'],
      beschluss: null,
      title: 'Innere Sicherheit',
      part: 'plenarprotokoll',
      text: '',
    });
    expect(fields.speakers).toEqual(['Dr. Robin Korte', 'Herbert Reul']);
    expect(fields.speaker_party).toEqual(['GRÜNE', 'Landesregierung']);
  });
});

describe('bezugOf and the Zu: line', () => {
  it('reads the referenced Drucksache from the descriptor', () => {
    expect(
      bezugOf(
        'Entschließungsantrag CDU, SPD, GRÜNE zu GesEntw LRg Drs 18/14581 Schick, Thorsten u.a. CDU'
      )
    ).toBe('18/14581');
    expect(bezugOf('Entschließungsantrag CDU, GRÜNE zu Antr SPD 18/7709 Schick, Thorsten')).toBe(
      '18/7709'
    );
    expect(bezugOf('Antrag CDU, GRÜNE Schick, Thorsten u.a. CDU')).toBeNull();
  });

  const entry: LandtagListEntry = {
    recordId: '1810968/0510',
    title: 'Digitale Souveränität als Grundlage sicherer Verwaltungsdigitalisierung',
    descriptor: 'Entschließungsantrag CDU, SPD, GRÜNE zu GesEntw LRg Drs 18/14581',
    documentKind: 'Drucksache',
    documentNumber: '18/17139',
    trailer: '16.12.2025 4 S.',
    publishedAt: '2025-12-16',
    pdfUrl: 'https://www.landtag.nrw.de/portal/WWW/dokumentenarchiv/Dokument/MMD18-17139.pdf',
    pageRanges: [],
    abstract: null,
    beschluss: null,
    systematik: [],
    schlagworte: [],
    redner: [],
  };
  const infoSiG =
    'Gesetz zur Stärkung der Informationssicherheit des Landes Nordrhein-Westfalen (Informationssicherheitsgesetz Nordrhein-Westfalen – InfoSiG NRW)';

  it('puts the wording of the originating item into the header of an Entschließungsantrag', () => {
    expect(headerTextOf(entry, 'drucksache', infoSiG).split('\n').slice(0, 5)).toEqual([
      '# Digitale Souveränität als Grundlage sicherer Verwaltungsdigitalisierung',
      '',
      'Drucksache 18/17139 vom 16.12.2025 (Landtag NRW)',
      'Entschließungsantrag CDU, SPD, GRÜNE zu GesEntw LRg Drs 18/14581',
      `Zu: ${infoSiG}`,
    ]);
  });

  it('leaves the line out when the document already carries that title', () => {
    const aenderung = { ...entry, title: `${infoSiG} ` };
    expect(headerTextOf(aenderung, 'drucksache', infoSiG)).not.toContain('Zu:');
    expect(headerTextOf(entry, 'drucksache', null)).not.toContain('Zu:');
  });
});
