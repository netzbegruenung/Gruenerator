import { describe, expect, it } from 'vitest';

import { DOCS_PAGES } from '../docs/docsIndex.generated.js';

import {
  buildGlossaryVocabularyNote,
  formatGlossaryDefinitions,
  GLOSSARY_TERM_RE,
  PRODUCT_GLOSSARY,
} from './productGlossary.js';

describe('PRODUCT_GLOSSARY', () => {
  it('links only docs pages that exist in the index', () => {
    const pages = new Set(DOCS_PAGES.map((p) => p.url));
    for (const entry of PRODUCT_GLOSSARY) {
      if (entry.docsPath) expect(pages.has(entry.docsPath), entry.id).toBe(true);
    }
  });

  it('derives the model tiers from the model catalog', () => {
    const tiers = PRODUCT_GLOSSARY.find((e) => e.id === 'modellstufen')!.definition;
    for (const name of ['Klein', 'Mittel', 'Ultra', 'Panda']) expect(tiers).toContain(name);
  });

  it('recognises the terms that failed live, not everyday size words', () => {
    for (const text of ['Panda', 'Ultra', 'Explainable', 'Podcast', 'Öko-Modus', 'Papierkorb']) {
      expect(GLOSSARY_TERM_RE.test(text), text).toBe(true);
    }
    for (const text of ['ein kleiner Ortsverband', 'mittelfristig', 'Kohleausstieg']) {
      expect(GLOSSARY_TERM_RE.test(text), text).toBe(false);
    }
  });

  it('keeps the loop note to names — definitions belong to product_knowledge', () => {
    const note = buildGlossaryVocabularyNote();
    expect(note).toContain('Explainable');
    expect(note).not.toContain('Erklärseite');
    expect(note).toContain('product_knowledge');
    expect(formatGlossaryDefinitions()).toContain('30 Tage');
  });
});
