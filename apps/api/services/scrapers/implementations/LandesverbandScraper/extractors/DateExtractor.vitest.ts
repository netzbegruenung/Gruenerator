/**
 * Guards the pre-OCR age filter (#3576): `isTooOld` must be evaluated against
 * the *source's* `maxAgeYears`, not a hard-coded 10 years — a PDF source
 * configured with `maxAgeYears: 5` would otherwise pass this gate and only get
 * rejected afterwards, at the store stage, once download + OCR already paid
 * for it. See LandesverbandScraper.ts's isPdfArchive branch.
 */
import { describe, expect, it } from 'vitest';

import { DateExtractor } from './DateExtractor.js';

describe('DateExtractor.extractDateFromPdfInfo — maxAgeYears', () => {
  it('a 5-year source rejects a 2019 PDF', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss-2019-03-01.pdf',
      'Beschluss',
      '',
      5
    );

    expect(result.dateString).toBe('2019-03-01');
    expect(result.isTooOld).toBe(true);
  });

  it('a 10-year source accepts the same 2019 PDF', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss-2019-03-01.pdf',
      'Beschluss',
      '',
      10
    );

    expect(result.dateString).toBe('2019-03-01');
    expect(result.isTooOld).toBe(false);
  });
});

describe('DateExtractor.extractDateFromPdfInfo — existing behaviour (characterization)', () => {
  it('a year-only match keeps the mid-year value (YYYY-06-15) but says it is only a year', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/ldk-2020.pdf',
      'LDK 2020',
      '',
      10
    );

    expect(result.dateString).toBe('2020-06-15');
    expect(result.precision).toBe('year');
  });

  it('returns null date/dateString/isTooOld when no date can be found anywhere', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss.pdf',
      'Beschluss',
      '',
      10
    );

    expect(result.date).toBeNull();
    expect(result.dateString).toBeNull();
    expect(result.isTooOld).toBeNull();
    expect(result.precision).toBeNull();
  });
});

const BB = 'https://archiv.gruene-brandenburg.de/userspace/BB/lv_brandenburg/beschluesse';
const SL = 'https://gruene-saar.de/wp-content/uploads/sites/2';
const NEUTRALITAET_PROSE =
  'Positionspapier Neutralitätsgesetz abschaffen Das Berliner Neutralitätsgesetz (Gesetz zu ' +
  'Artikel 29 der Verfassung von Berlin vom 27. Januar 2005) verbietet den Beamt*innen …';

/**
 * #3575: Aus einer bloßen Jahreszahl wurde der 15. Juni, obwohl das Datum über
 * dem Link stand oder im Pfad der Monat. Jede Zeile ist ein Fall aus dem Audit
 * (url + title + context → Datum + Genauigkeit).
 */
describe('DateExtractor.extractDateFromPdfInfo — precision (#3575)', () => {
  it.each([
    {
      name: 'BB: dated h3 above the link beats the month folder',
      url: `${BB}/2022/2022-03/L1NEU_Halbzeit_Wir_erneuern_Brandenburg.pdf`,
      title: 'Halbzeit: Wir erneuern Brandenburg!',
      context: 'Landesdelegiertenkonferenz am 26.03.22: | Halbzeit: Wir erneuern Brandenburg!',
      dateString: '2022-03-26',
      precision: 'day',
    },
    {
      name: 'BB: without context the /YYYY-MM/ folder gives the month',
      url: `${BB}/2022/2022-03/L1NEU_Halbzeit_Wir_erneuern_Brandenburg.pdf`,
      title: 'Halbzeit: Wir erneuern Brandenburg!',
      context: '',
      dateString: '2022-03-01',
      precision: 'month',
    },
    {
      name: 'BB: _2024_ in the filename is a target year, the heading wins',
      url: `${BB}/2022/2022-11/V11NEU_2024_im_Blick__Auf_dem_Weg_zum_Wahlerfolg.pdf`,
      title: '2024 im Blick – Auf dem Weg zum Wahlerfolg',
      context:
        'Landesdelegiertenkonferenz am 19.11.22: | 2024 im Blick – Auf dem Weg zum Wahlerfolg',
      dateString: '2022-11-19',
      precision: 'day',
    },
    {
      name: 'BB: _2024_ in the filename loses to the month folder',
      url: `${BB}/2022/2022-11/V11NEU_2024_im_Blick__Auf_dem_Weg_zum_Wahlerfolg.pdf`,
      title: '2024 im Blick – Auf dem Weg zum Wahlerfolg',
      context: '',
      dateString: '2022-11-01',
      precision: 'month',
    },
    {
      name: 'folder year beats a filename _YYYY_',
      url: `${BB}/2022/V11NEU_2024_im_Blick.pdf`,
      title: 'Im Blick',
      context: '',
      dateString: '2022-06-15',
      precision: 'year',
    },
    {
      name: 'MV: section heading beats the target year in the slug',
      url: 'https://gruene-mv.de/download/meilensteine-zur-landtagswahl-2026/',
      title: 'Meilensteine zur Landtagswahl 2026',
      context: '24. Mai 2025 - LDK Güstrow | Meilensteine zur Landtagswahl 2026 19.76 KB 1 file(s)',
      dateString: '2025-05-24',
      precision: 'day',
    },
    {
      name: 'MV: section heading beats Kommunalwahl 2024 in the slug',
      url: 'https://gruene-mv.de/download/leitantrag-der-gruene-fahrplan-zur-kommunalwahl-2024/',
      title: 'Leitantrag: Der Grüne Fahrplan zur Kommunalwahl 2024',
      context:
        '26. März 2022 - LDR Greifswald | Leitantrag: Der Grüne Fahrplan zur Kommunalwahl 2024',
      dateString: '2022-03-26',
      precision: 'day',
    },
    {
      name: 'SL: WordPress upload month instead of a mid-year guess',
      url: `${SL}/2025/10/S1_Das_Saarland_zur_Modellregion_fuer_eine_integrierte__zukunftsfaehige_Gesundheits-_und_Pflegepolitik_m.pdf`,
      title:
        'Das Saarland zur Modellregion für eine integrierte, zukunftsfähige Gesundheits- und Pflegepolitik',
      context: 'Beschlüsse / Anträge | Beschluss (Antrag S1)Das Saarland zur Modellregion',
      dateString: '2025-10-01',
      precision: 'month',
    },
    {
      name: 'SL: the upload month never overrides a day date from the context',
      url: `${SL}/2025/10/A1_Gegen_Altersdiskriminierung__Fuer_gleiche_Chancen_in_jedem_Lebensalter.pdf`,
      title: 'Gegen Altersdiskriminierung',
      context: 'Landesparteitag am 08.11.2025 | Beschluss (Antrag A1)Gegen Altersdiskriminierung',
      dateString: '2025-11-08',
      precision: 'day',
    },
    {
      name: 'SL: YY-MM-DD at the start of the filename',
      url: `${SL}/2022/02/22-02-17-wahlprogramm-ltw-2022.pdf`,
      title: 'Wahlprogramm zur Landtagswahl 2022',
      context: '',
      dateString: '2022-02-17',
      precision: 'day',
    },
    {
      name: 'BE-F: the file-name anchor beats a date in the description prose',
      url: 'https://gruene-fraktion.berlin/download/positionspapier-neutralitaetsgesetz-abschaffen/',
      title: 'Positionspapier Neutralitätsgesetz abschaffen',
      context: `${NEUTRALITAET_PROSE} | 20230905_Neutralitaetsgesetz-abschaffen.pdf`,
      dateString: '2023-09-05',
      precision: 'day',
    },
    {
      name: 'YYYYMMDD in the URL filename',
      url: 'https://gruene.example/wp-content/uploads/2024/01/20230905_Neutralitaetsgesetz.pdf',
      title: 'Neutralitätsgesetz',
      context: '',
      dateString: '2023-09-05',
      precision: 'day',
    },
    {
      name: 'slug month name gives the month',
      url: 'https://gruene-mv.de/download/protokoll-der-ldk-september-2022/',
      title: 'Protokoll der LDK',
      context: '',
      dateString: '2022-09-01',
      precision: 'month',
    },
    {
      name: 'slug day + month name gives the day',
      url: 'https://gruene-mv.de/download/protokoll-der-ldk-guestrow-12-oktober-2024/',
      title: 'Protokoll der LDK Güstrow',
      context: '',
      dateString: '2024-10-12',
      precision: 'day',
    },
    {
      name: 'MM-DD-YYYY with a second group > 12 is read as month-day, never rolled over',
      url: 'https://gruene.example/dokumente/beschluss-12-13-2025.pdf',
      title: 'Beschluss',
      context: '',
      dateString: '2025-12-13',
      precision: 'day',
    },
    {
      name: 'an impossible day-month pair falls through to the year',
      url: 'https://gruene.example/dokumente/beschluss-31-02-2025.pdf',
      title: 'Beschluss',
      context: '',
      dateString: '2025-06-15',
      precision: 'year',
    },
  ])('$name', ({ url, title, context, dateString, precision }) => {
    const result = DateExtractor.extractDateFromPdfInfo(url, title, context, 10);

    expect(result.dateString).toBe(dateString);
    expect(result.precision).toBe(precision);
  });

  it('a slug target year without any other signal stays a year guess', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene-mv.de/download/meilensteine-zur-landtagswahl-2026/',
      'Meilensteine zur Landtagswahl 2026',
      '',
      10
    );

    expect(result.dateString).toBe('2026-06-15');
    expect(result.precision).toBe('year');
  });

  it('a version number like "Az. 1.2.10" in the context is not a date', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss.pdf',
      'Beschluss',
      'Az. 1.2.10 | Beschluss',
      10
    );

    expect(result.dateString).toBeNull();
  });

  it('an invalid earlier DD.MM.YY does not hide a valid later one', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss.pdf',
      'Beschluss',
      'Frist 31.02.22 | Landesdelegiertenkonferenz am 26.03.22:',
      10
    );

    expect(result).toMatchObject({ dateString: '2022-03-26', precision: 'day' });
  });

  it('a slug month later than the upload month is a target date, not the publication', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/wp-content/uploads/2022/03/kommunalwahl-mai-2024.pdf',
      'Kommunalwahl',
      '',
      10
    );

    expect(result).toMatchObject({ dateString: '2022-03-01', precision: 'month' });
  });

  it('DD.MM.YY counts in the context only, not in the URL', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/version-1.10.24-entwurf.pdf',
      'Entwurf',
      '',
      10
    );

    expect(result.dateString).toBeNull();
  });
});

/**
 * #3564: BE-F dlm-downloads file names use a compact YYMMDD leading token
 * (250117_Positionspapier….pdf, 180828_Beschluss….pdf), not the YYYYMMDD form
 * already handled above. Must not fire on a Drucksache number or any other
 * digit run that isn't followed by `_`/`-`, and never on a future date.
 */
describe('DateExtractor.extractDateFromPdfInfo — BE-F leading YYMMDD file names (#3564)', () => {
  it.each([
    {
      name: 'YYMMDD_ at the start of the file name',
      fileName: '250117_Positionspapier_Klimaschutz.pdf',
      dateString: '2025-01-17',
      precision: 'day',
    },
    {
      name: 'YYMMDD- at the start of the file name',
      fileName: '180828-Beschluss_Verkehrswende.pdf',
      dateString: '2018-08-28',
      precision: 'day',
    },
  ])('$name', ({ fileName, dateString, precision }) => {
    const result = DateExtractor.extractDateFromPdfInfo(fileName, fileName, '', 10);

    expect(result.dateString).toBe(dateString);
    expect(result.precision).toBe(precision);
  });

  it('a 6-digit Drucksache number after a prefix is not a leading-token date', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'Drs_18-2345.pdf',
      'Drs_18-2345.pdf',
      '',
      10
    );

    expect(result.dateString).toBeNull();
  });

  it('6 digits with no separator after them is not a date', () => {
    const result = DateExtractor.extractDateFromPdfInfo('123456.pdf', '123456.pdf', '', 10);

    expect(result.dateString).toBeNull();
  });

  it('a future leading YYMMDD token is rejected', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      '301231_Beschluss.pdf',
      '301231_Beschluss.pdf',
      '',
      10
    );

    expect(result.dateString).toBeNull();
  });
});

/**
 * #3564: Wolke share files (Berlin Wahlprüfsteine, Saarland Parteitags-
 * protokolle) are stored with `publishedAt: null` today even though the file
 * name often carries a real date. LandesverbandScraper passes the bare file
 * name as both `url` and `title` with an empty context, so only the file-name
 * day tier can fire — never a folder or URL year.
 */
describe('DateExtractor.extractDateFromPdfInfo — Wolke file names (#3564)', () => {
  it.each([
    {
      name: 'DD.MM.YYYY in an LPT file name',
      fileName: 'LPT 08.11.2025 samt Anhang.pdf',
      dateString: '2025-11-08',
      precision: 'day',
    },
    {
      name: 'YYYY-MM-DD leading a folder-style file name',
      fileName: '2026-03-22-WKV Neunkirchen Protokoll',
      dateString: '2026-03-22',
      precision: 'day',
    },
    {
      name: 'MM-DD-YYYY read as month-day, never rolled over',
      fileName: '12-13-2025 Protokoll Parteirat.pdf',
      dateString: '2025-12-13',
      precision: 'day',
    },
  ])('$name', ({ fileName, dateString, precision }) => {
    const result = DateExtractor.extractDateFromPdfInfo(fileName, fileName, '', 10);

    expect(result.dateString).toBe(dateString);
    expect(result.precision).toBe(precision);
  });

  it('a file name without any date stays null, never invented', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'Wahlpruefstein_Verband_Antwort.pdf',
      'Wahlpruefstein_Verband_Antwort.pdf',
      '',
      10
    );

    expect(result.dateString).toBeNull();
    expect(result.precision).toBeNull();
  });
});
