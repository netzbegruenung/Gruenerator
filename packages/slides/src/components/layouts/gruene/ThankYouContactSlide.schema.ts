import * as z from 'zod/v4';

export const layoutId = 'b90-thank-you-contact-slide';
export const layoutName = 'Vielen Dank / Kontakt';
export const layoutDescription =
  'Abschlussfolie mit Dankesformel und Kontaktdaten. Für das Ende einer Präsentation mit Kontaktinformationen.';

export const Schema = z.object({
  title: z.string().max(40).describe('Abschlusstitel').default('Vielen Dank!'),
  subtitle: z
    .string()
    .max(100)
    .describe('Optionaler Untertitel')
    .default('Für Rückfragen stehe ich gerne zur Verfügung'),
  contactName: z.string().max(50).describe('Name der Kontaktperson').default('Maria Müller'),
  contactRole: z.string().max(80).describe('Rolle / Funktion').default('Fraktionsvorsitzende'),
  contactOrg: z.string().max(80).describe('Organisation').default('BÜNDNIS 90/DIE GRÜNEN'),
  contactAddress: z
    .string()
    .max(100)
    .describe('Adresse')
    .default('Platz vor dem Neuen Tor 1, 10115 Berlin'),
  contactPhone: z.string().max(30).describe('Telefonnummer').default('+49 30 28442-0'),
  contactEmail: z.string().max(60).describe('E-Mail-Adresse').default('maria.mueller@gruene.de'),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Optionales dekoratives Bild')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400',
      __image_prompt__: 'Sonnenblume als dekoratives Element',
    }),
});

export type ThankYouContactData = z.infer<typeof Schema>;
