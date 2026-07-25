/**
 * Detection is a PROPOSAL, so the interesting cases are the ones where it must
 * hold back: ordinary prose that merely contains numbers must not be mistaken
 * for an address, and nothing may be removed that was not recognised.
 */

import { describe, expect, it } from 'vitest';

import { detectLetterParts, hasDetectedParts, stripDetectedLines } from './letterDetection';

const LETTER = `Stadtverwaltung Musterstadt
Frau Erika Beispiel
Rathausplatz 1
12345 Musterstadt

Betreff: Antrag auf Radweg-Ausbau

Sehr geehrte Frau Beispiel,

wir beantragen den Ausbau des Radwegs entlang der Hauptstraße.

Mit freundlichen Grüßen
Maxi Mustermensch`;

describe('detectLetterParts', () => {
  it('erkennt Empfänger, Betreff, Anrede, Grußformel und Unterschrift', () => {
    const parts = detectLetterParts(LETTER);

    expect(parts.recipient).toBe(
      'Stadtverwaltung Musterstadt\nFrau Erika Beispiel\nRathausplatz 1\n12345 Musterstadt'
    );
    expect(parts.subject).toBe('Antrag auf Radweg-Ausbau');
    expect(parts.salutation).toBe('Sehr geehrte Frau Beispiel,');
    expect(parts.closing).toBe('Mit freundlichen Grüßen');
    expect(parts.signature).toBe('Maxi Mustermensch');
  });

  it('erkennt österreichische PLZ mit vier Stellen', () => {
    const parts = detectLetterParts('Verein Beispiel\nHauptplatz 3\n1010 Wien\n\nText.');

    expect(parts.recipient).toContain('1010 Wien');
  });

  it('überspringt einen ausdrücklich markierten Absender', () => {
    const parts = detectLetterParts(
      `Absender: Maxi Mustermensch
Musterweg 9
54321 Heimatstadt

Stadtverwaltung Musterstadt
Rathausplatz 1
12345 Musterstadt

Sehr geehrte Damen und Herren,`
    );

    // Der eigene Absender kommt aus dem Profil — er darf nicht als Empfänger
    // im Adressfeld landen.
    expect(parts.recipient).toContain('Rathausplatz 1');
    expect(parts.recipient).not.toContain('Musterweg 9');
  });

  it('respektiert eine ausdrückliche An:-Markierung', () => {
    const parts = detectLetterParts(
      'An:\nStadtwerke Musterstadt\nEnergieweg 2\n12345 Musterstadt\n\nText.'
    );

    expect(parts.recipient).toBe('Stadtwerke Musterstadt\nEnergieweg 2\n12345 Musterstadt');
  });

  it('hält sich bei normalem Fließtext zurück', () => {
    const parts = detectLetterParts(
      'Im Jahr 2026 wurden 12345 Fahrräder gezählt.\n\nDas sind 30 Prozent mehr als 2024.'
    );

    expect(hasDetectedParts(parts)).toBe(false);
    expect(parts.recipient).toBeUndefined();
  });

  it('erkennt keine Adresse ohne PLZ-Zeile', () => {
    const parts = detectLetterParts('Stadtverwaltung Musterstadt\nRathausplatz 1\n\nText.');

    expect(parts.recipient).toBeUndefined();
  });

  it('kommt mit einem Dokument ohne Briefbestandteile klar', () => {
    const parts = detectLetterParts('# Überschrift\n\nEin ganz normaler Absatz.');

    expect(hasDetectedParts(parts)).toBe(false);
    expect(parts.consumedLines).toEqual([]);
  });

  it('erkennt weitere gebräuchliche Grußformeln', () => {
    for (const closing of ['Viele Grüße', 'Herzliche Grüße', 'Mit grünen Grüßen']) {
      const parts = detectLetterParts(`Text.\n\n${closing}\nMaxi Mustermensch`);
      expect(parts.closing).toBe(closing);
      expect(parts.signature).toBe('Maxi Mustermensch');
    }
  });
});

describe('stripDetectedLines', () => {
  it('entfernt genau die erkannten Zeilen', () => {
    const parts = detectLetterParts(LETTER);
    const stripped = stripDetectedLines(LETTER, parts);

    expect(stripped).toContain('wir beantragen den Ausbau');
    expect(stripped).not.toContain('Rathausplatz 1');
    expect(stripped).not.toContain('Sehr geehrte Frau Beispiel,');
    expect(stripped).not.toContain('Mit freundlichen Grüßen');
  });

  it('lässt den Text unangetastet, wenn nichts erkannt wurde', () => {
    const text = '# Überschrift\n\nEin Absatz.';

    expect(stripDetectedLines(text, detectLetterParts(text))).toBe(text);
  });

  it('hinterlässt keine Absatz-Lücken', () => {
    const stripped = stripDetectedLines(LETTER, detectLetterParts(LETTER));

    expect(stripped).not.toMatch(/\n{3,}/);
    expect(stripped.startsWith('\n')).toBe(false);
  });
});
