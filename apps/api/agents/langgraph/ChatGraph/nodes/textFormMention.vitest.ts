/**
 * Der Nachschlage-Schlüssel für eine angelernte Textform — das speziellere
 * Rezept gewinnt, es wird nichts mehr zusammengefaltet.
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import { deriveTextFormMention } from './textFormMention.js';

describe('deriveTextFormMention', () => {
  it('gibt null zurück, wenn kein Rezept aktiv ist', () => {
    expect(deriveTextFormMention(null)).toBeNull();
  });

  it('schlägt ein generisches Rezept unter seinem eigenen Namen nach', () => {
    expect(deriveTextFormMention('presse')).toBe('presse');
    expect(deriveTextFormMention('instagram')).toBe('instagram');
    expect(deriveTextFormMention('facebook')).toBe('facebook');
  });

  // Der Kern von #2930: vorher fielen diese drei auf `presse`, und weil
  // `user_text_forms` unique auf `(user_id, mention)` ist, schaltete EIN
  // angelernter Presse-Stil die Vorgaben aller Landesverbands-Rezepte ab.
  it('faltet ein Landesverbands-Rezept NICHT auf das generische', () => {
    expect(deriveTextFormMention('presse-hessen-partei')).toBe('presse-hessen-partei');
    expect(deriveTextFormMention('presse-saarland')).toBe('presse-saarland');
    expect(deriveTextFormMention('insta-bayern')).toBe('insta-bayern');
  });

  // Österreich fiel auf denselben Schlüssel wie Deutschland — ein deutscher
  // Presse-Stil ersetzte das AT-Rezept und umgekehrt.
  it('hält die österreichischen Rezepte von den deutschen getrennt', () => {
    expect(deriveTextFormMention('presse-at')).toBe('presse-at');
    expect(deriveTextFormMention('insta-at')).toBe('insta-at');
    expect(deriveTextFormMention('presse-at')).not.toBe(deriveTextFormMention('presse'));
  });

  it('führt eine zurückgezogene Mention auf die lebende', () => {
    // Sonst hinge dieselbe angelernte Textform an zwei Schlüsseln.
    expect(deriveTextFormMention('presse-hessen')).toBe('presse-hessen-partei');
    expect(deriveTextFormMention('presse-bayern')).toBe('presse-bayern-partei');
  });

  it('lässt eigene Textformen unangetastet durch', () => {
    expect(deriveTextFormMention('omveinladungen')).toBe('omveinladungen');
    expect(deriveTextFormMention('wahlpruefstein')).toBe('wahlpruefstein');
    expect(deriveTextFormMention('buergermail')).toBe('buergermail');
  });
});
