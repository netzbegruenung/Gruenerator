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

  // The 13.08.2026 run: one job split into four turns. Turn 1 was detected and
  // routed to the careful lane; turns 2-4 were not and dropped to the speed
  // lane mid-thread, which is where the fidelity failures came from.
  describe('the four-turn run of 13.08.2026', () => {
    it('recognises a drawn table skeleton', () => {
      expect(
        detectTaskShape(
          'Erstelle ausschließlich diese Tabelle:\n' +
            '| Absatz (erste vier Wörter) | Überschrift | vollständig / verkürzt | was fehlt |'
        )
      ).toBe('strict_format');
    });

    it('recognises an exclusive-output order', () => {
      expect(detectTaskShape('Gib nur diese Befundtabelle aus.')).toBe('strict_format');
      expect(detectTaskShape('Erstelle ausschließlich „Schwierige Wörter“.')).toBe('strict_format');
      expect(detectTaskShape('Erstelle ausschliesslich die Zuordnung.')).toBe('strict_format');
    });

    it('recognises a verbatim-string requirement', () => {
      expect(detectTaskShape('Bei bekannten Begriffen ergänze exakt: „…“')).toBe('strict_format');
      expect(detectTaskShape('Verwende exakt diesen Hinweis am Ende')).toBe('strict_format');
    });
  });

  it('an intensity is not a contract', () => {
    // "nur" as a softener, not as a restriction on the deliverable.
    expect(detectTaskShape('Erklär mir nur kurz, worum es bei der Wärmewende geht')).toBeNull();
    expect(detectTaskShape('Ich wollte nur fragen, ob das Fest schon geplant ist')).toBeNull();
  });

  it('a single pipe in prose is not a table', () => {
    expect(detectTaskShape('Schreib über Bündnis 90 | Die Grünen in Bayern')).toBeNull();
  });
});

describe('detectTaskShape — null', () => {
  it('ordinary prose asks carry no shape', () => {
    expect(detectTaskShape('Plane unser Sommerfest')).toBeNull();
    expect(detectTaskShape('Schreibe eine Pressemitteilung zur Wärmewende')).toBeNull();
    expect(detectTaskShape('')).toBeNull();
  });
});
