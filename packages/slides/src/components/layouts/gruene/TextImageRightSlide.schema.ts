import * as z from 'zod/v4';

export const layoutId = 'b90-text-image-right-slide';
export const layoutName = 'Text links, Bild rechts';
export const layoutDescription =
  'Zweispaltige Folie mit Titel, Beschreibung und Aufzählungspunkten links, Bild rechts. Optionaler dekorativer Störer-Kreis.';

export const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(50)
    .describe('Hauptüberschrift der Folie')
    .default('Klimaschutz vor Ort'),
  description: z
    .string()
    .max(300)
    .describe('Beschreibungstext')
    .default(
      'Kommunale Klimaschutzstrategien sind der Schlüssel zur Erreichung unserer nationalen Klimaziele. Vor Ort werden die Weichen für eine nachhaltige Zukunft gestellt.'
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
      { text: 'Erneuerbare Energien in jeder Kommune' },
      { text: 'Nachhaltige Mobilität fördern' },
      { text: 'Grüne Infrastruktur ausbauen' },
    ]),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Bild auf der rechten Seite')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800',
      __image_prompt__: 'Grüner Wald mit Sonnenlicht',
    }),
  accentBadge: z
    .string()
    .max(30)
    .describe('Optionaler Text im Störer-Kreis, leer lassen wenn nicht gewünscht')
    .default('Wichtig!'),
});

export type TextImageRightData = z.infer<typeof Schema>;
