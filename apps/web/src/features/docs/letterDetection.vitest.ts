/**
 * Detection is a PROPOSAL for one field, so the interesting cases are the ones
 * where it must hold back: ordinary prose that merely contains numbers must not
 * be mistaken for an address, and nothing may be removed that was not
 * recognised — the removal deletes lines from the user's document.
 */

import { describe, expect, it } from 'vitest';

import { blockLines, detectRecipient, stripDetectedBlocks } from './letterDetection';

const LETTER = `Stadtverwaltung Musterstadt
Frau Erika Beispiel
Rathausplatz 1
12345 Musterstadt

Betreff: Antrag auf Radweg-Ausbau

Sehr geehrte Frau Beispiel,

wir beantragen den Ausbau des Radwegs entlang der Hauptstraße.

Mit freundlichen Grüßen
Maxi Mustermensch`;

describe('detectRecipient', () => {
  it('erkennt die Anschrift und sonst nichts', () => {
    const parts = detectRecipient(LETTER);

    expect(parts.recipient).toBe(
      'Stadtverwaltung Musterstadt\nFrau Erika Beispiel\nRathausplatz 1\n12345 Musterstadt'
    );
    // Betreff, Anrede, Grußformel und Unterschrift sind gewöhnlicher Brieftext —
    // sie bleiben stehen, wo sie geschrieben wurden.
    expect(parts.consumedLines).toEqual([0, 1, 2, 3]);
  });

  it('erkennt österreichische PLZ mit vier Stellen', () => {
    const parts = detectRecipient('Verein Beispiel\nHauptplatz 3\n1010 Wien\n\nText.');

    expect(parts.recipient).toContain('1010 Wien');
  });

  it('überspringt einen ausdrücklich markierten Absender', () => {
    const parts = detectRecipient(
      `Absender: Maxi Mustermensch
Musterweg 9
54321 Heimatstadt

Stadtverwaltung Musterstadt
Rathausplatz 1
12345 Musterstadt

Sehr geehrte Damen und Herren,`
    );

    // Der eigene Absender kommt aus dem Briefkopf — er darf nicht als Empfänger
    // im Adressfeld landen.
    expect(parts.recipient).toContain('Rathausplatz 1');
    expect(parts.recipient).not.toContain('Musterweg 9');
  });

  it('respektiert eine ausdrückliche An:-Markierung', () => {
    const parts = detectRecipient(
      'An:\nStadtwerke Musterstadt\nEnergieweg 2\n12345 Musterstadt\n\nText.'
    );

    expect(parts.recipient).toBe('Stadtwerke Musterstadt\nEnergieweg 2\n12345 Musterstadt');
    // Die Markierung selbst verschwindet mit — im Anschriftfeld hat sie nichts
    // zu suchen, im Text ohne die Adresse darunter auch nicht.
    expect(parts.consumedLines).toEqual([0, 1, 2, 3]);
  });

  it('hält sich bei normalem Fließtext zurück', () => {
    const parts = detectRecipient(
      'Im Jahr 2026 wurden 12345 Fahrräder gezählt.\n\nDas sind 30 Prozent mehr als 2024.'
    );

    expect(parts.recipient).toBeUndefined();
    expect(parts.consumedLines).toEqual([]);
  });

  it('erkennt keine Adresse ohne PLZ-Zeile', () => {
    const parts = detectRecipient('Stadtverwaltung Musterstadt\nRathausplatz 1\n\nText.');

    expect(parts.recipient).toBeUndefined();
  });

  it('kommt mit einem Dokument ohne Anschrift klar', () => {
    const parts = detectRecipient('# Überschrift\n\nEin ganz normaler Absatz.');

    expect(parts.recipient).toBeUndefined();
    expect(parts.consumedLines).toEqual([]);
  });
});

/**
 * The prefill and the removal must read the SAME text. They did not: the dialog
 * read the blocks while the removal ran on serialised HTML, where a line-based
 * detector matches nothing — so the address ended up both in the Anschriftfeld
 * and in the body.
 */
describe('blockLines + stripDetectedBlocks', () => {
  const p = (text: string) => ({ content: [{ type: 'text', text }] });
  const BLOCKS = [
    p('Stadtverwaltung Musterstadt'),
    p('Rathausplatz 1'),
    p('12345 Musterstadt'),
    p(''),
    p('Betreff: Antrag auf Radweg-Ausbau'),
    p(''),
    p('Sehr geehrte Damen und Herren,'),
    p(''),
    p('wir beantragen den Ausbau des Radwegs.'),
    p(''),
    p('Mit freundlichen Grüßen'),
    p('Maxi Mustermensch'),
  ];

  it('yields one line per block, so indices line up', () => {
    expect(blockLines(BLOCKS)).toHaveLength(BLOCKS.length);
    expect(blockLines(BLOCKS)[0]).toBe('Stadtverwaltung Musterstadt');
  });

  it('recognises the address from the block text', () => {
    const parts = detectRecipient(blockLines(BLOCKS).join('\n'));

    expect(parts.recipient).toBe('Stadtverwaltung Musterstadt\nRathausplatz 1\n12345 Musterstadt');
  });

  it('drops the address block and NOTHING else', () => {
    const parts = detectRecipient(blockLines(BLOCKS).join('\n'));
    const kept = blockLines(stripDetectedBlocks(BLOCKS, parts));

    expect(kept).not.toContain('Rathausplatz 1');
    // Der Brieftext gehört dem Dokument. Er wurde früher mit herausgeschnitten
    // und im Dialog noch einmal abgefragt — genau das ist weggefallen.
    expect(kept).toContain('Betreff: Antrag auf Radweg-Ausbau');
    expect(kept).toContain('Sehr geehrte Damen und Herren,');
    expect(kept).toContain('wir beantragen den Ausbau des Radwegs.');
    expect(kept).toContain('Mit freundlichen Grüßen');
    expect(kept).toContain('Maxi Mustermensch');
  });

  it('leaves the blocks untouched when nothing was recognised', () => {
    const plain = [p('# Überschrift'), p('Ein Absatz.')];
    const parts = detectRecipient(blockLines(plain).join('\n'));

    expect(stripDetectedBlocks(plain, parts)).toEqual(plain);
  });

  it('tolerates blocks without text content', () => {
    const withImage = [p('12345 Musterstadt'), { content: undefined }, p('Text')];

    expect(blockLines(withImage)).toEqual(['12345 Musterstadt', '', 'Text']);
  });
});
