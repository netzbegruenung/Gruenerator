import * as z from 'zod/v4';

export const layoutId = 'b90-text-only-slide';
export const layoutName = 'Textfolie (Zweispaltig)';
export const layoutDescription =
  'Textfolie mit Titel und zweispaltigem Fließtext. Für ausführliche Erklärungen und Argumentationen ohne Bild.';

export const Schema = z.object({
  title: z.string().min(3).max(50).describe('Hauptüberschrift').default('Unsere Kernforderungen'),
  columnLeft: z
    .string()
    .max(500)
    .describe('Text in der linken Spalte')
    .default(
      'Die Klimakrise ist die größte Herausforderung unserer Zeit. Wir brauchen jetzt entschlossenes Handeln auf allen Ebenen — von der Kommune bis zur Europäischen Union. Der Ausbau erneuerbarer Energien muss deutlich beschleunigt werden.'
    ),
  columnRight: z
    .string()
    .max(500)
    .describe('Text in der rechten Spalte')
    .default(
      'Gleichzeitig müssen wir dafür sorgen, dass die Transformation sozial gerecht gestaltet wird. Niemand darf zurückgelassen werden. Gute Arbeitsplätze, bezahlbare Energie und eine starke öffentliche Infrastruktur sind die Grundlage für eine erfolgreiche Klimapolitik.'
    ),
  accentBadge: z.string().max(30).describe('Optionaler Text im Störer-Kreis').default(''),
});

export type TextOnlyData = z.infer<typeof Schema>;
