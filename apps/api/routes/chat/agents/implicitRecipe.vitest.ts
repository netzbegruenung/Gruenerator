import { describe, expect, it } from 'vitest';

import { deriveImplicitRecipeMention } from './implicitRecipe.js';

describe('deriveImplicitRecipeMention', () => {
  it('picks presse for a plain PM writing ask', () => {
    expect(
      deriveImplicitRecipeMention('Schreib mir eine Pressemitteilung zum Radentscheid', 'de-DE')
    ).toBe('presse');
  });

  it('picks presse for the Austrian Presseaussendung', () => {
    expect(
      deriveImplicitRecipeMention('Verfasse eine Presseaussendung zur Bodenversiegelung', 'de-AT')
    ).toBe('presse');
  });

  it('picks instagram for insta shorthand', () => {
    expect(deriveImplicitRecipeMention('Mach einen Insta-Post zum Klimacamp', 'de-DE')).toBe(
      'instagram'
    );
  });

  it('covers the remaining platform vocab', () => {
    expect(deriveImplicitRecipeMention('Erstelle einen LinkedIn-Beitrag dazu', 'de-DE')).toBe(
      'linkedin'
    );
    expect(deriveImplicitRecipeMention('Schreib einen Tweet zur Abstimmung', 'de-DE')).toBe(
      'twitter'
    );
    expect(deriveImplicitRecipeMention('Texte ein Reel über die Aktion', 'de-DE')).toBe('reel');
    expect(
      deriveImplicitRecipeMention('Formuliere eine Antwort auf den Wahlprüfstein', 'de-DE')
    ).toBe('wahlpruefstein');
  });

  it('returns null without a writing verb', () => {
    expect(deriveImplicitRecipeMention('Die Pressemitteilung von gestern war gut', 'de-DE')).toBe(
      null
    );
  });

  it('returns null on transformation asks', () => {
    expect(
      deriveImplicitRecipeMention('Erstelle eine Zusammenfassung der Pressemitteilung', 'de-DE')
    ).toBe(null);
    expect(deriveImplicitRecipeMention('Kürze die Pressemitteilung auf 200 Wörter', 'de-DE')).toBe(
      null
    );
    expect(deriveImplicitRecipeMention('Übersetze den Instagram-Post ins Englische', 'de-DE')).toBe(
      null
    );
  });

  it('returns null on meta questions', () => {
    expect(
      deriveImplicitRecipeMention('Wie schreibe ich eine gute Pressemitteilung?', 'de-DE')
    ).toBe(null);
    expect(deriveImplicitRecipeMention('Was macht einen guten Insta-Post aus?', 'de-DE')).toBe(
      null
    );
  });

  it('returns null on negation', () => {
    expect(
      deriveImplicitRecipeMention(
        'Schreib den Text bitte ohne Pressemitteilungs-Floskeln, kein Instagram',
        'de-DE'
      )
    ).toBe(null);
  });

  it('returns null when two platforms are named', () => {
    expect(
      deriveImplicitRecipeMention('Schreib einen Post für Instagram und Facebook', 'de-DE')
    ).toBe(null);
  });

  it('ignores platform words inside quotes', () => {
    expect(
      deriveImplicitRecipeMention(
        'Schreib eine Antwort auf "Eure Pressemitteilung ist falsch"',
        'de-DE'
      )
    ).toBe(null);
  });
});
