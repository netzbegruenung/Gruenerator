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

  it('steht bei eingefügtem Material still, statt Wörter zu sammeln', () => {
    // Der Lauf vom 13.08.2026, verkürzt: eine eingefügte Webseite. Der
    // Fußzeilen-Link „Facebook" und irgendein „Text…" stehen beliebig weit
    // auseinander — als Auftragssatz gelesen ergäbe das ein Rezept, als
    // Dokument gelesen ist es Rauschen.
    //
    // GENAU EIN Plattformwort im Fixture: mit zweien griffe schon die
    // Zwei-Plattformen-Regel, und der Test wäre auch ohne den Längendeckel
    // grün — er würde dann etwas anderes messen, als er behauptet.
    const seite =
      'Hauptnavigation Nebennavigation Inhalt Fußzeile\n' +
      'Sofortprogramm für Klimaanlagen in Pflegeheimen. '.repeat(20) +
      '\nDen Text teilen auf: Facebook';
    expect(seite.length).toBeGreaterThan(500);
    expect(deriveImplicitRecipeMention(seite, 'de-DE')).toBe(null);

    // Die Kontrolle, die den Test ehrlich macht: derselbe Text unter der
    // Schwelle liefert sehr wohl ein Rezept. Ohne sie belegte oben nichts,
    // dass die Länge der Grund war.
    const kurz = 'Den Text teilen auf: Facebook';
    expect(kurz.length).toBeLessThan(500);
    expect(deriveImplicitRecipeMention(kurz, 'de-DE')).toBe('facebook');

    // Die Gegenprobe: derselbe Auftrag, kurz gehalten, greift weiter.
    expect(deriveImplicitRecipeMention('Schreib einen Facebook-Post dazu', 'de-DE')).toBe(
      'facebook'
    );
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

describe('deriveImplicitRecipeMention — Instanz-Tür', () => {
  // Ein Rezept, das die Instanz nicht anbietet, darf auch nicht implizit
  // zünden: der Turn schriebe sonst nach Vorgaben, die im Menü fehlen und die
  // niemand wieder abwählen kann.
  it('zündet reel nicht, wo die Instanz es ausblendet', () => {
    expect(deriveImplicitRecipeMention('Schreib mir ein Reel zum Deutschlandticket', 'de-DE')).toBe(
      'reel'
    );
    expect(
      deriveImplicitRecipeMention('Schreib mir ein Reel zum Deutschlandticket', 'de-DE', 'bgst')
    ).toBe(null);
  });

  it('lässt die übrigen Plattformwörter dort unberührt', () => {
    expect(
      deriveImplicitRecipeMention(
        'Schreib mir eine Pressemitteilung zum Radentscheid',
        'de-DE',
        'bgst'
      )
    ).toBe('presse');
  });
});
