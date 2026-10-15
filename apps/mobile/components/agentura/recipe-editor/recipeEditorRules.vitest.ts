import { MAX_TEXT_FORM_EXAMPLES } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  examplesStatus,
  isValidMention,
  mentionBlocker,
  normalizeMention,
  styleBlockValid,
  typeMention,
} from './recipeEditorRules';

const noCatalogue = () => false;

describe('typeMention', () => {
  it('keeps a trailing separator while typing and normalizes later', () => {
    expect(typeMention('mein ')).toBe('mein-');
    expect(typeMention('Mein Rezept')).toBe('mein-rezept');
    expect(normalizeMention('mein-')).toBe('mein');
  });
});

describe('isValidMention', () => {
  it('follows the contract rule', () => {
    expect(isValidMention('a')).toBe(false);
    expect(isValidMention('ab')).toBe(true);
    expect(isValidMention('Ab')).toBe(false);
    expect(isValidMention('a'.repeat(49))).toBe(false);
  });
});

describe('mentionBlocker', () => {
  it('blocks reserved names without a link', () => {
    expect(mentionBlocker('neu', null, noCatalogue)).toEqual({
      text: 'Dieser Name ist reserviert.',
      recipeMention: null,
    });
  });

  it('blocks presets and catalogue recipes with a link', () => {
    expect(mentionBlocker('presse', null, noCatalogue)?.recipeMention).toBe('presse');
    expect(mentionBlocker('mein-katalog', null, (m) => m === 'mein-katalog')?.recipeMention).toBe(
      'mein-katalog'
    );
  });

  it('lets a free custom mention through', () => {
    expect(mentionBlocker('mein-rezept-xyz', null, noCatalogue)).toBeNull();
  });
});

describe('examplesStatus', () => {
  it('reports count and strategy', () => {
    const status = examplesStatus('Eins\n\n---\n\nZwei');
    expect(status.examples).toEqual(['Eins', 'Zwei']);
    expect(status.summary).toContain('2 Beispiele erkannt (an den Trennlinien)');
    expect(status.blockReason).toBeNull();
  });

  it('blocks too many examples', () => {
    const raw = Array.from({ length: MAX_TEXT_FORM_EXAMPLES + 1 }, (_, i) => `T${i}`).join(
      '\n---\n'
    );
    expect(examplesStatus(raw).blockReason).toMatch(/höchstens/);
  });
});

describe('styleBlockValid', () => {
  it('requires non-empty text within the limit', () => {
    expect(styleBlockValid('  ')).toBe(false);
    expect(styleBlockValid('Schreibe kurz.')).toBe(true);
    expect(styleBlockValid('x'.repeat(8001))).toBe(false);
  });
});
