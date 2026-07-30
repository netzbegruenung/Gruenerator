// Role/level configuration for the profile "Deine Rollen" feature.
// Shared between web (apps/web profile) and mobile (apps/mobile profile) so the
// AT/DE role taxonomy stays single-sourced — Austria is a first-class locale.

import { LANDESVERBAENDE } from '../agents/landesverbaende.js';
import { getDisabledNotebookIds } from '../notebooks/index.js';

export interface EbeneConfig {
  id: string;
  label: string;
  icon: string;
}

export interface BundeslandConfig {
  label: string;
  notebookId?: string;
}

export const DE_EBENEN: EbeneConfig[] = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'kreisverband', label: 'Kreisverband', icon: '📍' },
  { id: 'ortsverband', label: 'Ortsverband', icon: '🏘️' },
];

export const AT_EBENEN: EbeneConfig[] = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'bezirk', label: 'Bezirk', icon: '📍' },
  { id: 'gemeinde', label: 'Gemeinde', icon: '🏘️' },
];

export const DE_ROLLEN: Record<string, string[]> = {
  europa: ['EU-Abgeordnete*r', 'Mitarbeiter*in EU-Abgeordnete*r', 'Mitarbeiter*in Europagruppe'],
  bund: [
    'Mitarbeiter*in Bundesgeschäftsstelle',
    'Mitarbeiter*in Bundestagsfraktion',
    'Mitarbeiter*in MdB-Büro',
  ],
  land: [
    'Mitarbeiter*in Landesgeschäftsstelle',
    'Mitarbeiter*in Landtagsfraktion',
    'Mitarbeiter*in MdL-Büro',
  ],
  kreisverband: [
    'Mitarbeiter*in Kreisverband',
    'Mitarbeiter*in Kreistagsfraktion',
    'Ratsmitglied',
    'Presse & Social-Media',
  ],
  ortsverband: [
    'Mitarbeiter*in Ortsverband',
    'Mitarbeiter*in Ratsfraktion',
    'Ratsmitglied',
    'Presse & Social-Media',
  ],
};

export const AT_ROLLEN: Record<string, string[]> = {
  europa: ['EU-Abgeordnete*r', 'Mitarbeiter*in EU-Abgeordnete*r', 'Mitarbeiter*in Europagruppe'],
  bund: [
    'Mitarbeiter*in Bundespartei',
    'Mitarbeiter*in Grüner Klub (Nationalrat)',
    'Mitarbeiter*in NR-Abgeordnetenbüro',
  ],
  land: [
    'Mitarbeiter*in Landesorganisation',
    'Mitarbeiter*in Landtagsklub',
    'Mitarbeiter*in LT-Abgeordnetenbüro',
  ],
  bezirk: ['Mitarbeiter*in Bezirksorganisation', 'Bezirksrät*in', 'Presse & Social-Media'],
  gemeinde: ['Mitarbeiter*in Gemeindegruppe', 'Gemeinderät*in', 'Presse & Social-Media'],
};

/** All sixteen, in the order the wizard offers them. */
const DE_BUNDESLAND_LABELS = [
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
] as const;

/**
 * `notebookId` is derived from the Landesverband registry, never typed by hand —
 * the previous hand-maintained version had drifted: Hessen, Sachsen-Anhalt and
 * Saarland lacked an id despite having notebooks, and Schleswig-Holstein carried
 * one although its notebook is switched off. That drove the wrong "● Notebook"
 * hint in the wizard. `label` matching `LandesverbandEntry.title` is
 * load-bearing — it is the join key `landesverbandIdsForRoles` uses.
 */
export const DE_BUNDESLAENDER: BundeslandConfig[] = DE_BUNDESLAND_LABELS.map((label) => {
  const entry = LANDESVERBAENDE.find((lv) => lv.title === label);
  const enabled = entry && !getDisabledNotebookIds().has(entry.notebookId);
  return enabled ? { label, notebookId: entry.notebookId } : { label };
});

export const AT_BUNDESLAENDER: BundeslandConfig[] = [
  { label: 'Wien' },
  { label: 'Niederösterreich' },
  { label: 'Oberösterreich' },
  { label: 'Steiermark' },
  { label: 'Kärnten' },
  { label: 'Salzburg' },
  { label: 'Tirol' },
  { label: 'Vorarlberg' },
  { label: 'Burgenland' },
];

export const NEEDS_BUNDESLAND = new Set([
  'land',
  'kreisverband',
  'ortsverband',
  'bezirk',
  'gemeinde',
]);
export const NEEDS_LOCAL_NAME = new Set(['kreisverband', 'ortsverband', 'bezirk', 'gemeinde']);

export const LOCAL_NAME_LABELS: Record<string, string> = {
  kreisverband: 'Name des Kreisverbands',
  ortsverband: 'Name des Ortsverbands',
  bezirk: 'Name des Bezirks',
  gemeinde: 'Name der Gemeinde',
};

export const LOCAL_NAME_PLACEHOLDERS: Record<string, string> = {
  kreisverband: 'z.B. KV Köln',
  ortsverband: 'z.B. OV Ehrenfeld',
  bezirk: 'z.B. Innsbruck-Land',
  gemeinde: 'z.B. Innsbruck',
};

export function needsAbgeordneteName(rolle: string): boolean {
  const lower = rolle.toLowerCase();
  return (
    lower.includes('abgeordnete') || lower.includes('mdb-büro') || lower.includes('nr-abgeordneten')
  );
}
