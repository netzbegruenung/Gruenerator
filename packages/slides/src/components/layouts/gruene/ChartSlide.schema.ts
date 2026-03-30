import * as z from 'zod/v4';

export const layoutId = 'b90-chart-slide';
export const layoutName = 'Diagrammfolie';
export const layoutDescription =
  'Folie mit Titel, Beschreibung und einem Diagramm. Unterstützt Balken-, Linien-, Flächen-, Kreis- und Ringdiagramme.';

const SeriesSchema = z.object({
  name: z.string().max(32),
  color: z.string().optional(),
  values: z.array(z.number()).min(1),
});

export const Schema = z.object({
  title: z.string().max(40).describe('Titel der Folie').default('Ergebnisse im Überblick'),
  description: z
    .string()
    .max(200)
    .describe('Kurze Beschreibung zum Diagramm')
    .default(
      'Die wichtigsten Kennzahlen der letzten Quartale zeigen eine positive Entwicklung in allen Bereichen.'
    ),
  chart: z
    .object({
      type: z.enum(['bar', 'line', 'area', 'pie', 'donut']).default('bar'),
      categories: z.array(z.string().max(16)).min(1),
      series: z.array(SeriesSchema).min(1),
    })
    .describe('Diagramm-Konfiguration')
    .default({
      type: 'bar',
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'Mitglieder', values: [1200, 1450, 1680, 1920] },
        { name: 'Veranstaltungen', values: [45, 62, 78, 95] },
      ],
    }),
});

export type ChartData = z.infer<typeof Schema>;

export { SeriesSchema };
