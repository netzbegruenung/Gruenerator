import { describe, expect, it } from 'vitest';

import { detectChatIntent } from './docTypeMeta';

describe('detectChatIntent', () => {
  it('erkennt Fragen an den Chat', () => {
    expect(detectChatIntent('Wie steht die Fraktion zum Naturpark?')).toBe(true);
    expect(detectChatIntent('was ist der Unterschied zwischen Antrag und Anfrage')).toBe(true);
    expect(detectChatIntent('Kannst du mir das erklären')).toBe(true);
    expect(detectChatIntent('Gibt es dazu schon einen Beschluss?')).toBe(true);
    expect(detectChatIntent('Hilf mir bei der Einschätzung')).toBe(true);
  });

  it('erkennt Verbstämme in jeder Beugung — `\\b` hinter dem Stamm täte das nicht', () => {
    expect(detectChatIntent('erklär mir den Antrag')).toBe(true);
    expect(detectChatIntent('Erkläre mir den Antrag')).toBe(true);
    expect(detectChatIntent('erklärst du mir das')).toBe(true);
    expect(detectChatIntent('Erzähl mir mehr dazu')).toBe(true);
    // Das Substantiv ist ein Suchbegriff, kein Gesprächsauftakt.
    expect(detectChatIntent('Erklärung zur Wärmepumpe')).toBe(false);
  });

  it('lässt Erstell-Prompts in Ruhe, auch wenn sie eine Frage enthalten', () => {
    expect(
      detectChatIntent(
        'Erstelle eine Grußwortrede aus folgenden Informationen: … Frage: wie steht die Grüne Fraktion dazu?'
      )
    ).toBe(false);
    expect(detectChatIntent('Schreib einen Antrag zum Hitzeschutz')).toBe(false);
    expect(detectChatIntent('Mach eine Tabelle für den Haushalt')).toBe(false);
  });

  it('lässt Suchbegriffe in Ruhe', () => {
    expect(detectChatIntent('')).toBe(false);
    expect(detectChatIntent('Hitzeschutz')).toBe(false);
    expect(detectChatIntent('Protokoll Mai')).toBe(false);
    // Zu kurz für eine Frage — eher ein Tippfehler als ein Gesprächsauftakt.
    expect(detectChatIntent('Antrag?')).toBe(false);
  });
});
