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
