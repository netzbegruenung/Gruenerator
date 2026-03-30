import * as z from 'zod/v4';

export const layoutId = 'b90-full-bleed-image-slide';
export const layoutName = 'Bildfolie mit Textoverlay';
export const layoutDescription =
  'Vollflächiges Bild mit halbtransparentem Textbereich. Für visuelle Statements, Zitate und eindrucksvolle Botschaften.';

export const Schema = z.object({
  title: z
    .string()
    .max(60)
    .describe('Überschrift über dem Bild')
    .default('Für eine lebenswerte Zukunft'),
  description: z
    .string()
    .max(250)
    .describe('Beschreibungstext im Overlay-Bereich')
    .default(
      'Wir kämpfen für saubere Luft, gesunde Lebensmittel und den Schutz unserer natürlichen Lebensgrundlagen — heute und für kommende Generationen.'
    ),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Hintergrundbild')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1280',
      __image_prompt__: 'Grüner Wald mit Sonnenstrahlen',
    }),
  overlayPosition: z.enum(['left', 'right']).describe('Position des Textbereichs').default('left'),
});

export type FullBleedImageData = z.infer<typeof Schema>;
