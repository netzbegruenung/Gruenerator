import * as z from 'zod/v4';

export const layoutId = 'b90-title-image-slide';
export const layoutName = 'Titelfolie mit Hintergrundbild';
export const layoutDescription =
  'Vollflächiges Hintergrundbild mit Titel und Untertitel als Overlay. Für wirkungsvolle Einstiege und visuelle Abschnittswechsel.';

export const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(60)
    .describe('Haupttitel über dem Bild')
    .default('Zusammenbringen, was zusammen gehört'),
  subtitle: z
    .string()
    .max(200)
    .describe('Untertitel oder Beschreibung')
    .default('Unsere Vision für ein nachhaltiges und gerechtes Deutschland'),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Hintergrundbild für die Folie')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1280',
      __image_prompt__: 'Weite grüne Landschaft mit Sonnenblumen',
    }),
});

export type TitleImageData = z.infer<typeof Schema>;
