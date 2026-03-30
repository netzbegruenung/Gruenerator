import * as z from 'zod/v4';

export const layoutId = 'b90-branded-message-slide';
export const layoutName = 'Statement-Folie';
export const layoutDescription =
  'Wirkungsvolle Folie mit einer großen Kernbotschaft und farblich hervorgehobenem Schlüsselwort. Für Zitate, Kernaussagen und Leitsätze.';

export const Schema = z.object({
  icon: z
    .object({
      __icon_url__: z.string(),
      __icon_query__: z.string().max(20),
    })
    .describe('Kleines Icon links neben der Botschaft')
    .default({
      __icon_url__: '/static/icons/placeholder.png',
      __icon_query__: 'leaf green icon',
    }),
  messageBefore: z
    .string()
    .max(60)
    .describe('Textabschnitt vor dem hervorgehobenen Wort')
    .default('Zusammenbringen,'),
  messageHighlight: z
    .string()
    .max(40)
    .describe('Farblich hervorgehobenes Schlüsselwort')
    .default('was zusammen gehört'),
  messageAfter: z
    .string()
    .max(60)
    .describe('Textabschnitt nach dem hervorgehobenen Wort')
    .default(''),
  subtitle: z
    .string()
    .max(150)
    .describe('Optionaler Untertitel unter der Botschaft')
    .default('Für ein gerechtes, nachhaltiges und freies Land'),
});

export type BrandedMessageData = z.infer<typeof Schema>;
