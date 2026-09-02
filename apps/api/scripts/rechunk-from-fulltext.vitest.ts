import { describe, expect, it } from 'vitest';

import { checkIdRecipe, parseArgs, pointIdRecipeFor } from './rechunk-from-fulltext.js';

/**
 * Die drei lebenden Kopf-Punkt-IDs von `grundsatz_documents`, am 02.09.2026
 * gegen die Produktions-Qdrant gemessen (Spec, Abschnitt C) und aus den
 * `documentId`-Werten in `ProgramPdfScraper.ts:80-106` reproduzierbar.
 */
const GRUNDSATZ_HEAD_IDS: Array<{ documentId: string; id: number }> = [
  { documentId: '20200125_Grundsatzprogramm', id: 1461662554 },
  { documentId: '20240306_Reader_EU-Wahlprogramm2024_A4', id: 143658016 },
  { documentId: '20250318_Regierungsprogramm_DIGITAL_DINA5', id: 1652781759 },
];

/**
 * Für `landesverbaende_documents` nennt die Spec keine Beispiel-URL, nur das
 * Ergebnis (200/200 lebende Kopf-Punkte getroffen). Dieser Anker hält also das
 * REZEPT fest, nicht eine lebende Zeile; der Abgleich gegen den echten Bestand
 * ist die Vorbedingung, die das Skript zur Laufzeit selbst fährt.
 */
const LV_URL = 'https://www.gruene-bw.de/wp-content/uploads/2025/03/beschluss-waermewende.pdf';

describe('pointIdRecipeFor', () => {
  it('rechnet die drei lebenden grundsatz-IDs exakt nach', () => {
    const recipe = pointIdRecipeFor('grundsatz_documents');
    expect(recipe?.idKey).toBe('document_id');
    for (const { documentId, id } of GRUNDSATZ_HEAD_IDS) {
      expect(recipe?.id(documentId, 0)).toBe(id);
    }
  });

  it('benutzt für landesverbaende_documents source_url, nicht document_id', () => {
    const recipe = pointIdRecipeFor('landesverbaende_documents');
    expect(recipe?.idKey).toBe('source_url');
    expect(recipe?.id(LV_URL, 0)).toBe(98221080);
    expect(recipe?.id(LV_URL, 1)).toBe(98221079);
  });

  it('kennt kein Rezept für documents — die Sammlung ist tabu', () => {
    expect(pointIdRecipeFor('documents')).toBeNull();
    expect(pointIdRecipeFor('kommunalwiki_documents')).toBeNull();
  });
});

describe('checkIdRecipe', () => {
  const recipe = pointIdRecipeFor('grundsatz_documents')!;

  it('bestätigt Punkte, die dem Rezept folgen', () => {
    const check = checkIdRecipe(
      GRUNDSATZ_HEAD_IDS.map(({ documentId, id }) => ({
        id,
        payload: { document_id: documentId, chunk_index: 0 },
      })),
      recipe
    );

    expect(check).toEqual({ checked: 3, matched: 3, mismatches: [] });
  });

  it('meldet eine einzige Abweichung — das reicht für den Abbruch', () => {
    const check = checkIdRecipe(
      [
        { id: 1461662554, payload: { document_id: '20200125_Grundsatzprogramm', chunk_index: 0 } },
        // Dieselbe Sache nach dem md5-Rezept aus reprocess-pdfs.ts:303-306:
        // parseInt(md5('20200125_Grundsatzprogramm:1').slice(0, 15), 16).
        // Dieselbe Sammlung, dasselbe Dokument — ein anderer Punkt.
        {
          id: 333119085792083840,
          payload: { document_id: '20200125_Grundsatzprogramm', chunk_index: 1 },
        },
      ],
      recipe
    );

    expect(check.checked).toBe(2);
    expect(check.matched).toBe(1);
    expect(check.mismatches).toEqual([
      {
        id: 333119085792083840,
        key: '20200125_Grundsatzprogramm',
        chunkIndex: 1,
        expected: 1461662555,
      },
    ]);
  });

  it('zählt einen Punkt ohne Schlüsselfeld als Abweichung, nicht als Treffer', () => {
    const check = checkIdRecipe([{ id: 1, payload: { chunk_index: 0 } }], recipe);

    expect(check.matched).toBe(0);
    expect(check.mismatches).toHaveLength(1);
  });
});

describe('parseArgs', () => {
  it('verlangt --collection', () => {
    expect(() => parseArgs([])).toThrow(/--collection/);
  });

  it('liest alle Schalter', () => {
    expect(parseArgs(['--collection', 'grundsatz_documents', '--dry-run', '--limit', '5'])).toEqual(
      {
        collection: 'grundsatz_documents',
        dryRun: true,
        onlyStructured: false,
        resume: false,
        limit: 5,
      }
    );
  });

  it('kennt --only-structured und --resume', () => {
    const args = parseArgs([
      '--collection',
      'landesverbaende_documents',
      '--only-structured',
      '--resume',
    ]);
    expect(args.onlyStructured).toBe(true);
    expect(args.resume).toBe(true);
    expect(args.limit).toBe(Infinity);
  });

  it('lehnt ein unbekanntes Argument ab, statt es zu ignorieren', () => {
    expect(() => parseArgs(['--collection', 'x', '--all'])).toThrow(/--all/);
  });
});
