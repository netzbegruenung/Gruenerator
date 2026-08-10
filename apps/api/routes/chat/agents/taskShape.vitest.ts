import { describe, it, expect } from 'vitest';

import { detectTaskShape } from './taskShape.js';

describe('detectTaskShape — code', () => {
  it('recognises JSON deliverables (the QA extraction task)', () => {
    expect(
      detectTaskShape('Extrahiere die folgenden Anmeldungen als JSON-Array mit name und stunden:')
    ).toBe('code');
    expect(detectTaskShape('Gib mir das als valides JSON zurück')).toBe('code');
  });

  it('recognises fenced code and machine formats', () => {
    expect(detectTaskShape('Was macht dieser Code?\n```ts\nconst a = 1;\n```')).toBe('code');
    expect(detectTaskShape('Schreib mir eine SQL-Abfrage dafür')).toBe('code');
    expect(detectTaskShape('Baue einen regulären Ausdruck für Postleitzahlen')).toBe('code');
    expect(detectTaskShape('Passe die config.yaml an')).toBe('code');
  });

  it('sticks to code on a short edit follow-up after a code answer', () => {
    expect(
      detectTaskShape('Ändere den Wert für Anna auf 5', {
        lastAssistantText: '[{"name": "Anna", "stunden": 4}]',
      })
    ).toBe('code');
    expect(
      detectTaskShape('Ändere den Wert für Anna auf 5', {
        lastAssistantText: 'Hier die Zusammenfassung des Treffens in Prosa.',
      })
    ).toBeNull();
  });

  it('does not stick on a full new question after a code answer', () => {
    const long =
      'Kannst du mir bitte ausführlich erklären, welche Position die Grünen zur ' +
      'Kindergrundsicherung vertreten und wie sich das vom Koalitionsvertrag unterscheidet, ' +
      'gern mit Beispielen aus dem Wahlprogramm und den letzten Beschlüssen?';
    expect(detectTaskShape(long, { lastAssistantText: '```json\n{"a":1}\n```' })).toBeNull();
  });

  it('a Reel-Skript is prose, not code', () => {
    expect(detectTaskShape('Schreib mir ein Skript für ein Reel zur Wärmewende')).toBeNull();
  });
});

describe('detectTaskShape — strict_format', () => {
  it('recognises counted format orders', () => {
    expect(detectTaskShape('Fasse den folgenden Text in genau drei Sätzen zusammen: …')).toBe(
      'strict_format'
    );
    expect(detectTaskShape('Antworte in genau zwei Zeilen')).toBe('strict_format');
    expect(detectTaskShape('Maximal 280 Zeichen bitte')).toBe('strict_format');
  });

  it('recognises suppression/preservation orders', () => {
    expect(detectTaskShape('Übersetze das, ohne Einleitung')).toBe('strict_format');
    expect(detectTaskShape('Markiere bitte nur die Änderungen am Plan')).toBe('strict_format');
    expect(detectTaskShape('Zeilenumbrüche beibehalten!')).toBe('strict_format');
  });

  it('code wins over strict_format when both match', () => {
    expect(detectTaskShape('Gib genau drei Sätze als JSON aus')).toBe('code');
  });

  it('counted CONTENT wishes are not format orders', () => {
    expect(detectTaskShape('Nenne mir genau drei Beispiele für Bürgerenergie')).toBeNull();
  });
});

describe('detectTaskShape — null', () => {
  it('ordinary prose asks carry no shape', () => {
    expect(detectTaskShape('Plane unser Sommerfest')).toBeNull();
    expect(detectTaskShape('Schreibe eine Pressemitteilung zur Wärmewende')).toBeNull();
    expect(detectTaskShape('')).toBeNull();
  });
});
