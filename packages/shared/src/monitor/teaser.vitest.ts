import { describe, expect, it } from 'vitest';

import { teaser, trimTeaser } from './teaser.js';

// Echte Anreißer aus /api/monitor/what-happened (gruenerator.eu, 06.11.2026),
// wie die API sie liefert: 500 Zeichen, mitten im Wort abgeschnitten.
const BRANDENBURG =
  'Die Brandenburger Bündnisgrünen schlagen einen Rechenzentrumseuro vor, um Standortkommunen verbindlich an der Wertschöpfung großer Rechenzentren zu beteiligen. Das Konzept wird an die Landesregierung übermittelt. Vorgesehen ist eine jährliche Zahlung von 10.000 Euro je Megawatt Anschlussleistung. Sie soll dort greifen, wo Kommunen nicht über den geplanten besonderen Verteilungsschlüssel bei der Gewerbesteuer beteiligt werden. Clemens Rostock, Landesvorsitzender der Brandenburger Bündnisgrünen, s';
const POGROM =
  'Nie wieder ist jetzt Erinnerung an die Reichspogromnacht Mathias Wagner, Fraktionsvorsitzender der GRÜNEN Landtagsfraktion: „Die Reichspogromnacht am 9. November 1938 war ein grausamer Wendepunkt in der deutschen Geschichte. Synagogen, jüdische Geschäfte und Wohnungen wurden zerstört, tausende Jüdinnen und Juden wurden getötet oder verschleppt.';

describe('trimTeaser', () => {
  it('ends at the last whole sentence that fits', () => {
    expect(trimTeaser(BRANDENBURG)).toBe(
      'Die Brandenburger Bündnisgrünen schlagen einen Rechenzentrumseuro vor, um Standortkommunen verbindlich an der Wertschöpfung großer Rechenzentren zu beteiligen. Das Konzept wird an die Landesregierung übermittelt.'
    );
  });

  it('does not end a sentence at an ordinal or an abbreviation', () => {
    const out = trimTeaser(teaser('Nie wieder ist jetzt', POGROM));
    expect(out).not.toMatch(/9\.$/);
    expect(
      trimTeaser(
        'Mit Prof. Dr. Meron Mendel nominieren wir eine Persönlichkeit. Er steht für Verständigung.',
        70
      )
    ).toBe('Mit Prof. Dr. Meron Mendel nominieren wir eine Persönlichkeit.');
  });

  it('cuts at a word with an ellipsis only when no sentence fits', () => {
    const out = trimTeaser('Ein sehr langer Satz ohne Ende '.repeat(12));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(221);
    expect(out).not.toMatch(/\s…$/);
  });

  it('keeps a short text as it is', () => {
    expect(trimTeaser('Kurzer Anreißer.')).toBe('Kurzer Anreißer.');
    expect(trimTeaser('Kurz und ohne Punkt')).toBe('Kurz und ohne Punkt');
  });
});

describe('teaser', () => {
  it('drops a headline the text repeats at its start', () => {
    expect(
      teaser(
        'Die Geister, die Boris Rhein rief',
        'Die Geister, die Boris Rhein rief Zu den Entgleisungen von Minister Pentz erklärt Mathias Wagner das Nötige.'
      )
    ).toBe('Zu den Entgleisungen von Minister Pentz erklärt Mathias Wagner das Nötige.');
  });
});
