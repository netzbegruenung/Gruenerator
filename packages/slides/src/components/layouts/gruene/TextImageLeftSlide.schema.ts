import * as z from 'zod/v4';

export const layoutId = 'b90-text-image-left-slide';
export const layoutName = 'Bild links, Text rechts';
export const layoutDescription =
  'Zweispaltige Folie mit Bild links und Titel, Beschreibung, Aufzählungspunkten rechts. Gespiegelte Variante der Text-Bild-Folie.';

export const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(50)
    .describe('Hauptüberschrift der Folie')
    .default('Soziale Gerechtigkeit'),
  description: z
    .string()
    .max(300)
    .describe('Beschreibungstext')
    .default(
      'Eine gerechte Gesellschaft braucht gleiche Chancen für alle. Wir setzen uns für bezahlbares Wohnen, faire Löhne und ein starkes Sozialsystem ein.'
    ),
  bulletPoints: z
    .array(
      z.object({
        text: z.string().max(80).describe('Aufzählungspunkt'),
      })
    )
    .max(5)
    .describe('Optionale Stichpunkte')
    .default([
      { text: 'Bezahlbarer Wohnraum für alle' },
      { text: 'Gerechte Steuerpolitik' },
      { text: 'Starke öffentliche Daseinsvorsorge' },
    ]),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Bild auf der linken Seite')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800',
      __image_prompt__: 'Menschen gemeinsam in einer Gruppe',
    }),
  accentBadge: z
    .string()
    .max(30)
    .describe('Optionaler Text im Störer-Kreis, leer lassen wenn nicht gewünscht')
    .default('Gemeinsam!'),
});

export type TextImageLeftData = z.infer<typeof Schema>;
