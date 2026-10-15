import { type TranslationLanguage } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { AUTO, initialRecent } from './languageOptions.js';

const lang = (code: string, name: string): TranslationLanguage => ({
  code,
  name,
  usableAsSource: true,
  usableAsTarget: true,
  formality: false,
  glossary: false,
});

// Sorted by name, as sourceOptions/targetOptions hand them over.
const SOURCES = [
  lang('ace', 'Aceh'),
  lang('ar', 'Arabisch'),
  lang('de', 'Deutsch'),
  lang('en', 'Englisch'),
  lang('fr', 'Französisch'),
  lang('uk', 'Ukrainisch'),
];

const TARGETS = [
  lang('ace', 'Aceh'),
  lang('de', 'Deutsch'),
  lang('en-GB', 'Englisch (Vereinigtes Königreich)'),
  lang('en-US', 'Englisch (Vereinigte Staaten)'),
  lang('fr', 'Französisch'),
];

describe('initialRecent', () => {
  it('maps a target-only wish to the source variant of the same language', () => {
    expect(initialRecent(SOURCES, [AUTO, 'de', 'en-GB'])).toEqual([AUTO, 'de', 'en', 'fr']);
  });

  it('pads with common languages, not the start of the alphabet', () => {
    expect(initialRecent(TARGETS, ['en-GB', 'de'], 3)).toEqual(['en-GB', 'de', 'fr']);
  });

  it('does not offer a second variant of a language already on the strip', () => {
    expect(initialRecent(TARGETS, ['en-GB'], 3)).toEqual(['en-GB', 'fr', 'ace']);
  });

  it('falls back to the start of the list when no common language is offered', () => {
    expect(initialRecent([lang('ace', 'Aceh'), lang('de', 'Deutsch')], ['de'], 3)).toEqual([
      'de',
      'ace',
    ]);
  });
});
