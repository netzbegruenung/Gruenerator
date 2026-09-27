/**
 * Der Ebenen-Zuschnitt entscheidet, woran sich eine Landesverbands-PM erdet.
 *
 * Der Ausschnitt hängt am AGENTEN und umfasst beide Ebenen (`['HE','HE-F']`),
 * das Rezept ist aber für eine geschrieben. Ohne Zuschnitt holt sich die
 * hessische Partei-PM ihre Vorlagen aus 166 Partei- und 2.073 Fraktions-PMs —
 * überwiegend also das Gegenteil dessen, was sie nachahmen soll. Der Fehler ist
 * unsichtbar: es kommt ein Text heraus, nur im falschen Register.
 *
 * Der Rückfall auf den vollen Ausschnitt ist deshalb genauso tragend wie der
 * Zuschnitt selbst. Ein einstufiger Landesverband führt nur den Basiscode; ein
 * leeres Ergebnis wäre dort keine Präzision, sondern gar keine Beispiele.
 */
import { describe, expect, it } from 'vitest';

import { lvEbeneForMentions, narrowLvScopeToEbene } from './lvScope.js';

describe('narrowLvScopeToEbene', () => {
  it('trennt die beiden Ebenen eines zweistufigen Landesverbands', () => {
    expect(narrowLvScopeToEbene(['HE', 'HE-F'], 'partei')).toEqual(['HE']);
    expect(narrowLvScopeToEbene(['HE', 'HE-F'], 'fraktion')).toEqual(['HE-F']);
  });

  it('lässt den Ausschnitt stehen, wenn die Ebene keinen Code trifft', () => {
    // Brandenburg, Saarland, Thüringen führen nur den Basiscode — `TH-F` steht
    // zwar in der Registry, hat im Korpus aber null Dokumente.
    expect(narrowLvScopeToEbene(['BB'], 'fraktion')).toEqual(['BB']);
    expect(narrowLvScopeToEbene('SL', 'fraktion')).toBe('SL');
  });

  it('rührt einen Ausschnitt ohne Ebenenangabe nicht an', () => {
    expect(narrowLvScopeToEbene(['HE', 'HE-F'], null)).toEqual(['HE', 'HE-F']);
    expect(narrowLvScopeToEbene(undefined, 'partei')).toBeUndefined();
  });

  it('nimmt auch einen einzelnen Code als Zeichenkette', () => {
    expect(narrowLvScopeToEbene('HE-F', 'fraktion')).toEqual(['HE-F']);
    expect(narrowLvScopeToEbene('HE-F', 'partei')).toBe('HE-F');
  });
});

describe('lvEbeneForMentions', () => {
  it('nimmt die erste Kennung, die eine Ebene nennt', () => {
    // Ein Turn darf zwei Rezepte laden; nur eines davon ist ein LV-Presserezept.
    expect(lvEbeneForMentions(['instagram', 'presse-bayern-fraktion'])).toBe('fraktion');
  });

  it('bevorzugt die ausdrücklich gewählte Kennung vor der nachgeladenen', () => {
    // Der Aufrufer stellt `activeSkillMention` nach vorn: wer das Rezept selbst
    // wählt, wird nicht von der Wahl des Modells überstimmt.
    expect(lvEbeneForMentions(['presse-hessen-partei', 'presse-hessen-fraktion'])).toBe('partei');
  });

  it('bleibt null, wenn keine Kennung eine Ebene trägt', () => {
    expect(lvEbeneForMentions([null, undefined, 'presse', 'presse-brandenburg'])).toBeNull();
    expect(lvEbeneForMentions([])).toBeNull();
  });

  it('löst eine zurückgezogene Kennung auf, statt sie zu übergehen', () => {
    expect(lvEbeneForMentions(['presse-hessen'])).toBe('partei');
  });
});
