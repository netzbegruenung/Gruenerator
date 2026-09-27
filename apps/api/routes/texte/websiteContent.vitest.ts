/**
 * Die Aufbereitung der Modellantwort für `POST /api/texte/website`.
 *
 * Der Anlass für `attachImages`-Tests ist ein konkreter Fehler im Vorgänger:
 * er las die Bild-URLs mit festen Indizes (`slice(1,4)` / `slice(4,7)` / `[7]`)
 * aus einem flachen Array und rechnete damit fest mit je drei Themen und
 * Aktionen. Lieferte das Modell zwei — erlaubt, das Schema fordert nur eins —
 * bekamen die Aktionen die Bilder der Themen und das Kontaktbild fiel weg.
 */
import { type WebsiteContent } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { attachImages, clampSections, parseModelJson } from './websiteContent.js';

function content(themes: number, actions: number): WebsiteContent {
  return {
    hero: { heading: 'Hallo', text: 'Kurz' },
    about: { title: 'Über mich', content: 'Text' },
    hero_image: { title: 'Slogan', subtitle: 'Untertitel' },
    themes: Array.from({ length: themes }, (_, i) => ({
      title: `Thema ${i}`,
      content: `Inhalt ${i}`,
    })),
    actions: Array.from({ length: actions }, (_, i) => ({
      text: `Aktion ${i}`,
      link: `#${i}`,
    })),
    contact: { title: 'Kontakt', email: 'a@b.c' },
  };
}

/** Bildwähler-Attrappe: gibt den angefragten Text als URL zurück. */
const echoPick = (text: string): Promise<string> => Promise.resolve(`img:${text}`);

describe('parseModelJson', () => {
  it('liest schlichtes JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('entfernt den Code-Zaun, den das Modell trotz Anweisung setzt', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('rettet echte Zeilenumbrüche innerhalb von Zeichenketten', () => {
    // JSON.parse allein bricht hier ab — genau der Fall, für den die
    // Escape-Runde existiert (about.content trennt Absätze durch Leerzeilen).
    expect(() => JSON.parse('{"a":"eins\nzwei"}')).toThrow();
    expect(parseModelJson('{"a":"eins\nzwei"}')).toEqual({ a: 'eins\nzwei' });
  });

  it('wirft bei unlesbarer Antwort, statt still etwas zu erfinden', () => {
    expect(() => parseModelJson('Klar, hier ist deine Seite!')).toThrow();
  });
});

describe('clampSections', () => {
  it('kürzt Themen und Aktionen auf drei', () => {
    const result = clampSections(content(5, 4));
    expect(result.themes).toHaveLength(3);
    expect(result.actions).toHaveLength(3);
  });

  it('lässt kürzere Listen unangetastet', () => {
    const result = clampSections(content(2, 1));
    expect(result.themes).toHaveLength(2);
    expect(result.actions).toHaveLength(1);
  });
});

describe('attachImages', () => {
  it('ordnet jedem Abschnitt sein eigenes Bild zu', async () => {
    const result = await attachImages(content(3, 3), echoPick);

    expect(result.hero_image.imageUrl).toBe('img:Slogan Untertitel');
    expect(result.themes.map((t) => t.imageUrl)).toEqual([
      'img:Thema 0 Inhalt 0',
      'img:Thema 1 Inhalt 1',
      'img:Thema 2 Inhalt 2',
    ]);
    expect(result.actions.map((a) => a.imageUrl)).toEqual([
      'img:Aktion 0',
      'img:Aktion 1',
      'img:Aktion 2',
    ]);
    expect(result.contact.backgroundImageUrl).toBe('img:Kontakt Kontakt Politik Grüne');
  });

  // Der eigentliche Regressionstest: bei zwei Themen verschob der Vorgänger
  // alles Nachfolgende um eine Stelle.
  it('bleibt richtig, wenn das Modell weniger als drei Abschnitte liefert', async () => {
    const result = await attachImages(content(2, 2), echoPick);

    expect(result.themes.map((t) => t.imageUrl)).toEqual([
      'img:Thema 0 Inhalt 0',
      'img:Thema 1 Inhalt 1',
    ]);
    expect(result.actions.map((a) => a.imageUrl)).toEqual(['img:Aktion 0', 'img:Aktion 1']);
    expect(result.contact.backgroundImageUrl).toBe('img:Kontakt Kontakt Politik Grüne');
  });

  it('trägt einen leeren String ein, wenn der Bildwähler nichts findet', async () => {
    const result = await attachImages(content(1, 1), () => Promise.resolve(''));
    expect(result.themes[0]?.imageUrl).toBe('');
    expect(result.contact.backgroundImageUrl).toBe('');
  });
});
