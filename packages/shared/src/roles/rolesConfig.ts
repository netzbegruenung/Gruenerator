// Role/level configuration for the profile "Deine Rollen" feature.
// Shared between web (apps/web profile) and mobile (apps/mobile profile) so the
// AT/DE role taxonomy stays single-sourced — Austria is a first-class locale.

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

export const DE_BUNDESLAENDER: BundeslandConfig[] = [
  { label: 'Baden-Württemberg' },
  { label: 'Bayern', notebookId: 'bayern-notebook' },
  { label: 'Berlin', notebookId: 'berlin-notebook' },
  { label: 'Brandenburg', notebookId: 'brandenburg-notebook' },
  { label: 'Bremen' },
  { label: 'Hamburg', notebookId: 'hamburg-notebook' },
  { label: 'Hessen', notebookId: 'hessen-notebook' },
  { label: 'Mecklenburg-Vorpommern', notebookId: 'mecklenburg-vorpommern-notebook' },
  { label: 'Niedersachsen' },
  { label: 'Nordrhein-Westfalen' },
  { label: 'Rheinland-Pfalz' },
  { label: 'Saarland', notebookId: 'saarland-notebook' },
  { label: 'Sachsen', notebookId: 'sachsen-notebook' },
  { label: 'Sachsen-Anhalt', notebookId: 'sachsen-anhalt-notebook' },
  { label: 'Schleswig-Holstein', notebookId: 'schleswig-holstein-notebook' },
  { label: 'Thüringen', notebookId: 'thueringen-notebook' },
];

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

/**
 * Schlüssel der Rollen-Bausteine. **Nur die IDs stehen hier** — der Prompttext
 * jeder Rolle ist parteiintern und liegt im privaten Repo unter
 * `rollen/<schlüssel>.md`, genau wie die Rezept-Bodies (siehe
 * `apps/api/services/skills/internalPrompts.ts`). Dieses Paket landet im
 * Web-Bundle und in jeder ausgelieferten Mobile-Binary; was hier steht, ist
 * veröffentlicht.
 *
 * F1 — eingefroren: die Schlüssel sind Dateinamen im privaten Repo. Umbenennen
 * heißt, dort mitzubenennen, sonst fällt die Rolle stumm auf den Basis-Agenten
 * zurück.
 */
export const ROLE_BAUSTEIN_KEYS = [
  'eu-abgeordnete',
  'eu-abgeordnetenbuero',
  'europagruppe',
  'bundesgeschaeftsstelle',
  'bundestagsfraktion',
  'mdb-buero',
  'landesgeschaeftsstelle',
  'landtagsfraktion',
  'mdl-buero',
  'kreisverband',
  'kreistagsfraktion',
  'kreistagsmitglied',
  'ortsverband',
  'ratsfraktion',
  'ratsmitglied',
  'presse-social-media',
  'at-bundespartei',
  'at-gruener-klub',
  'at-nr-abgeordnetenbuero',
  'at-landesorganisation',
  'at-landtagsklub',
  'at-lt-abgeordnetenbuero',
  'at-bezirksorganisation',
  'at-bezirksraetin',
  'at-gemeindegruppe',
  'at-gemeinderaetin',
] as const;

export type RoleBausteinKey = (typeof ROLE_BAUSTEIN_KEYS)[number];

/**
 * Rollenbezeichnung → Baustein. Die Bezeichnung ist der Schlüssel, weil genau
 * sie in den Nutzerdaten steht (`role.rolle`) — eine eigene ID daneben müsste
 * für Bestandsrollen erst nachgetragen werden.
 */
const BAUSTEIN_BY_ROLLE: Record<string, RoleBausteinKey> = {
  'EU-Abgeordnete*r': 'eu-abgeordnete',
  'Mitarbeiter*in EU-Abgeordnete*r': 'eu-abgeordnetenbuero',
  'Mitarbeiter*in Europagruppe': 'europagruppe',
  'Mitarbeiter*in Bundesgeschäftsstelle': 'bundesgeschaeftsstelle',
  'Mitarbeiter*in Bundestagsfraktion': 'bundestagsfraktion',
  'Mitarbeiter*in MdB-Büro': 'mdb-buero',
  'Mitarbeiter*in Landesgeschäftsstelle': 'landesgeschaeftsstelle',
  'Mitarbeiter*in Landtagsfraktion': 'landtagsfraktion',
  'Mitarbeiter*in MdL-Büro': 'mdl-buero',
  'Mitarbeiter*in Kreisverband': 'kreisverband',
  'Mitarbeiter*in Kreistagsfraktion': 'kreistagsfraktion',
  'Mitarbeiter*in Ortsverband': 'ortsverband',
  'Mitarbeiter*in Ratsfraktion': 'ratsfraktion',
  'Presse & Social-Media': 'presse-social-media',
  'Mitarbeiter*in Bundespartei': 'at-bundespartei',
  'Mitarbeiter*in Grüner Klub (Nationalrat)': 'at-gruener-klub',
  'Mitarbeiter*in NR-Abgeordnetenbüro': 'at-nr-abgeordnetenbuero',
  'Mitarbeiter*in Landesorganisation': 'at-landesorganisation',
  'Mitarbeiter*in Landtagsklub': 'at-landtagsklub',
  'Mitarbeiter*in LT-Abgeordnetenbüro': 'at-lt-abgeordnetenbuero',
  'Mitarbeiter*in Bezirksorganisation': 'at-bezirksorganisation',
  'Bezirksrät*in': 'at-bezirksraetin',
  'Mitarbeiter*in Gemeindegruppe': 'at-gemeindegruppe',
  'Gemeinderät*in': 'at-gemeinderaetin',
};

/**
 * Dieselbe Bezeichnung meint je nach Ebene ein anderes Gremium: „Ratsmitglied"
 * sitzt im Kreisverband im Kreistag, im Ortsverband im Gemeinde- oder Stadtrat.
 * Diese Fälle gehen vor der Bezeichnung allein.
 */
const BAUSTEIN_BY_EBENE_ROLLE: Record<string, RoleBausteinKey> = {
  'kreisverband:Ratsmitglied': 'kreistagsmitglied',
  'ortsverband:Ratsmitglied': 'ratsmitglied',
};

/**
 * Der Baustein zu einer Rolle, oder `null` für frei eingetippte Rollen — die
 * haben keinen Katalogeintrag und fallen auf die KI-Erzeugung zurück.
 */
export function roleBausteinKey(ebene: string, rolle: string): RoleBausteinKey | null {
  return BAUSTEIN_BY_EBENE_ROLLE[`${ebene}:${rolle}`] ?? BAUSTEIN_BY_ROLLE[rolle] ?? null;
}

export function needsAbgeordneteName(rolle: string): boolean {
  const lower = rolle.toLowerCase();
  return (
    lower.includes('abgeordnete') || lower.includes('mdb-büro') || lower.includes('nr-abgeordneten')
  );
}
