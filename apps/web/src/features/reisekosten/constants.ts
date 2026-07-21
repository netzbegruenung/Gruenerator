import type { ReisekostenState } from '@gruenerator/contracts';

export const STEPS = ['Reise', 'Person', 'Fahrt', 'Verpflegung & Übernachtung', 'Prüfen & Export'];

export const MODE_TILES: ReadonlyArray<{
  key: keyof ReisekostenState['fahrt'];
  emoji: string;
  label: string;
  hint?: string;
}> = [
  { key: 'bahn', emoji: '🚆', label: 'Bahn' },
  { key: 'oepnv', emoji: '🚋', label: 'ÖPNV' },
  { key: 'kfz', emoji: '🚗', label: 'Kfz' },
  { key: 'miete', emoji: '🚙', label: 'Mietwagen' },
  { key: 'taxi', emoji: '🚕', label: 'Taxi', hint: 'mit Begründung' },
  { key: 'sonstiges', emoji: '🧾', label: 'Sonstiges', hint: 'optional' },
];
