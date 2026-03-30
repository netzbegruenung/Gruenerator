import * as z from 'zod/v4';

export const layoutId = 'b90-intro-slide';
export const layoutName = 'Titelfolie';
export const layoutDescription =
  'Einleitungsfolie mit großem Titel, Untertitel, Vortragenden-Info und optionalem Bild. Für die erste Folie einer Präsentation.';

export const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(60)
    .describe('Haupttitel der Präsentation')
    .default('Zusammen wirken'),
  subtitle: z
    .string()
    .max(200)
    .describe('Untertitel oder kurze Beschreibung')
    .default('Gemeinsam für eine lebenswerte Zukunft — unsere Strategie für die kommenden Jahre'),
  presenterName: z
    .string()
    .max(50)
    .describe('Name der vortragenden Person')
    .default('Maria Müller'),
  presenterRole: z.string().max(80).describe('Rolle oder Funktion').default('Fraktionsvorsitzende'),
  date: z.string().max(30).describe('Datum der Präsentation').default('März 2026'),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Optionales Bild rechts')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1472289065668-ce650ac443d2?w=800',
      __image_prompt__: 'Sonnige Landschaft mit grüner Natur',
    }),
});

export type IntroData = z.infer<typeof Schema>;
