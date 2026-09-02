/**
 * Die Schemata des Chunk-Inspektors tragen die eine Aussage der Seite: `null`
 * heisst „nicht gespeichert", `0` hiesse „gemessen und null". Ein Feld, das
 * fehlen darf, statt `null` zu sein, würde diesen Unterschied wieder einebnen —
 * deshalb ist `undefined` hier ein Fehler und `null` erlaubt.
 *
 * Der Test liegt in apps/api, weil packages/contracts keinen Test-Runner hat
 * (kein `test`-Skript, keine vitest.config) — Vorbild: routes/docs/
 * docsContractSchemas.vitest.ts.
 */
import {
  inspectDocumentQuerySchema,
  inspectSearchQuerySchema,
  inspectedChunkSchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

describe('inspectDocumentQuerySchema', () => {
  it('setzt die Vorgaben für offset und limit', () => {
    const parsed = inspectDocumentQuerySchema.parse({ collection: 'grundsatz-system' });
    expect(parsed.offset).toBe(0);
    expect(parsed.limit).toBe(50);
  });

  it('nimmt Zahlen als Zeichenkette an — Query-Parameter kommen als Text', () => {
    const parsed = inspectDocumentQuerySchema.parse({
      collection: 'grundsatz-system',
      offset: '100',
      limit: '25',
    });
    expect(parsed.offset).toBe(100);
    expect(parsed.limit).toBe(25);
  });

  it('weist eine Seitengrösse über 200 ab', () => {
    expect(
      inspectDocumentQuerySchema.safeParse({ collection: 'grundsatz-system', limit: 500 }).success
    ).toBe(false);
  });

  it('verlangt eine Sammlung', () => {
    expect(inspectDocumentQuerySchema.safeParse({ collection: '' }).success).toBe(false);
  });
});

describe('inspectSearchQuerySchema', () => {
  it('weist eine Anfrage unter zwei Zeichen ab', () => {
    expect(inspectSearchQuerySchema.safeParse({ collection: 'x', query: 'a' }).success).toBe(false);
  });
});

describe('inspectedChunkSchema', () => {
  const base = {
    index: 0,
    page: null,
    text: 'Hallo',
    charCount: 5,
    tokenCount: null,
    qualityScore: null,
    hasTable: false,
    embeddingPresent: true,
    sparsePresent: false,
  };

  it('nimmt qualityScore: null an — „nicht gespeichert"', () => {
    expect(inspectedChunkSchema.parse(base).qualityScore).toBeNull();
  });

  it('weist ein fehlendes qualityScore ab — „vergessen" ist keine Aussage', () => {
    const { qualityScore: _dropped, ...withoutQuality } = base;
    expect(inspectedChunkSchema.safeParse(withoutQuality).success).toBe(false);
  });
});
