import * as z from 'zod/v4';

export const layoutId = 'b90-agenda-slide';
export const layoutName = 'Tagesordnung';
export const layoutDescription =
  'Nummerierte Tagesordnung oder Inhaltsverzeichnis. Für die Struktur einer Präsentation oder Sitzung.';

export const Schema = z.object({
  title: z.string().min(3).max(40).describe('Überschrift der Tagesordnung').default('Tagesordnung'),
  items: z
    .array(
      z.object({
        label: z.string().max(80).describe('Tagesordnungspunkt'),
      })
    )
    .min(2)
    .max(10)
    .describe('Liste der Tagesordnungspunkte')
    .default([
      { label: 'Begrüßung und Einführung' },
      { label: 'Rückblick: Ergebnisse der letzten Monate' },
      { label: 'Strategie 2026 — Schwerpunkte und Ziele' },
      { label: 'Klimaschutzpolitik: aktuelle Entwicklungen' },
      { label: 'Diskussion und offene Fragen' },
      { label: 'Nächste Schritte und Verabschiedung' },
    ]),
});

export type AgendaData = z.infer<typeof Schema>;
