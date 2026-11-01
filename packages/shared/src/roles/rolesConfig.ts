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
  { id: 'gruene-jugend', label: 'GRÜNE JUGEND', icon: '🌻' },
];

export const AT_EBENEN: EbeneConfig[] = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'bezirk', label: 'Bezirk', icon: '📍' },
  { id: 'gemeinde', label: 'Gemeinde', icon: '🏘️' },
  { id: 'gruene-jugend', label: 'Grüne Jugend', icon: '🌻' },
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
  'gruene-jugend': [
    'Bundesverband GRÜNE JUGEND',
    'Landesverband GRÜNE JUGEND',
    'GRÜNE JUGEND vor Ort',
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
  'gruene-jugend': [
    'Bundesorganisation Grüne Jugend',
    'Landesorganisation Grüne Jugend',
    'Grüne Jugend vor Ort',
  ],
};

/** Alle sechzehn, in der Reihenfolge, in der der Assistent sie anbietet. */
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
 * `notebookId` wird aus der Landesverbands-Registry abgeleitet, nie von Hand
 * getippt. Die handgepflegte Fassung war auseinandergelaufen: Hessen, Saarland
 * und Sachsen-Anhalt trugen keine Id, obwohl ihr Notebook existiert, während
 * Hamburg, Schleswig-Holstein und Sachsen eine trugen, obwohl ihre Notebooks
 * per `enabled: false` abgeschaltet sind. Beides zeigte der Rollen-Assistent
 * als „● Notebook"-Hinweis falsch an.
 *
 * Dass `label` dem `title` eines `LandesverbandEntry` entspricht, ist tragend:
 * genau darüber ordnet `landesverbandIdsForRoles` eine Rolle ihrem
 * Landesverband zu.
 */
export const DE_BUNDESLAENDER: BundeslandConfig[] = DE_BUNDESLAND_LABELS.map((label) => {
  const entry = LANDESVERBAENDE.find((lv) => lv.title === label);
  return entry && !getDisabledNotebookIds().has(entry.notebookId)
    ? { label, notebookId: entry.notebookId }
    : { label };
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

/**
 * Ebenen, auf denen erst die Rolle feststeht und danach der Ort: in der Grünen
 * Jugend entscheidet die Rolle, ob es ein Bundesland (Landesverband) oder dazu
 * noch eine Ortsgruppe (vor Ort) braucht — der Bundesverband braucht keins.
 */
export const ROLLE_FIRST_EBENEN = new Set(['gruene-jugend']);

const ROLLE_NEEDS: Record<string, { bundesland: boolean; localName: boolean }> = {
  'Landesverband GRÜNE JUGEND': { bundesland: true, localName: false },
  'GRÜNE JUGEND vor Ort': { bundesland: true, localName: true },
  'Landesorganisation Grüne Jugend': { bundesland: true, localName: false },
  'Grüne Jugend vor Ort': { bundesland: true, localName: true },
};

/** Ob eine Rolle ein Bundesland braucht — auf ihrer Ebene oder, wo die Rolle zuerst kommt, durch sie. */
export function needsBundesland(ebene: string, rolle: string | null): boolean {
  if (ROLLE_FIRST_EBENEN.has(ebene))
    return rolle !== null && ROLLE_NEEDS[rolle]?.bundesland === true;
  return NEEDS_BUNDESLAND.has(ebene);
}

/** Ob eine Rolle den Namen ihrer Gliederung braucht. */
export function needsLocalName(ebene: string, rolle: string | null): boolean {
  if (ROLLE_FIRST_EBENEN.has(ebene))
    return rolle !== null && ROLLE_NEEDS[rolle]?.localName === true;
  return NEEDS_LOCAL_NAME.has(ebene);
}

export const LOCAL_NAME_LABELS: Record<string, string> = {
  kreisverband: 'Name des Kreisverbands',
  ortsverband: 'Name des Ortsverbands',
  bezirk: 'Name des Bezirks',
  gemeinde: 'Name der Gemeinde',
  'gruene-jugend': 'Name der Ortsgruppe',
};

export const LOCAL_NAME_PLACEHOLDERS: Record<string, string> = {
  kreisverband: 'z.B. KV Köln',
  ortsverband: 'z.B. OV Ehrenfeld',
  bezirk: 'z.B. Innsbruck-Land',
  gemeinde: 'z.B. Innsbruck',
  'gruene-jugend': 'z.B. Ortsgruppe Nord',
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
  'gj-bundesverband',
  'gj-landesverband',
  'gj-vor-ort',
  'at-gj-bundesorganisation',
  'at-gj-landesorganisation',
  'at-gj-vor-ort',
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
  'Bundesverband GRÜNE JUGEND': 'gj-bundesverband',
  'Landesverband GRÜNE JUGEND': 'gj-landesverband',
  'GRÜNE JUGEND vor Ort': 'gj-vor-ort',
  'Bundesorganisation Grüne Jugend': 'at-gj-bundesorganisation',
  'Landesorganisation Grüne Jugend': 'at-gj-landesorganisation',
  'Grüne Jugend vor Ort': 'at-gj-vor-ort',
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

/**
 * Das Land einer Rolle in der Grünen Jugend, oder `null` für jede andere Rolle.
 * Eine aktive GJ-Rolle schreibt Instagram im GJ-Stil und entwirft Sharepics im
 * GJ-Design.
 */
export function grueneJugendRoleLocale(
  role: { ebene?: string | undefined; rolle?: string | undefined } | null | undefined
): 'de-DE' | 'de-AT' | null {
  const key = role?.rolle ? roleBausteinKey(role.ebene ?? '', role.rolle) : null;
  if (key?.startsWith('at-gj-')) return 'de-AT';
  return key?.startsWith('gj-') ? 'de-DE' : null;
}

export function needsAbgeordneteName(rolle: string): boolean {
  const lower = rolle.toLowerCase();
  return (
    lower.includes('abgeordnete') || lower.includes('mdb-büro') || lower.includes('nr-abgeordneten')
  );
}

/**
 * Kurzform jeder Katalogrolle für die Rollen-Anzeige im Composer. Der volle
 * Name („Mitarbeiter*in Landesgeschäftsstelle") sprengt dort jede Chipbreite
 * und wurde bisher mitten im Wort abgeschnitten.
 *
 * Der Schlüssel ist der Baustein, nicht die Bezeichnung: `roleBausteinKey`
 * löst damit gleich die Doppeldeutigkeit von „Ratsmitglied" mit auf (im
 * Kreisverband der Kreistag, im Ortsverband der Rat).
 *
 * Drei Muster, damit die Kürzel untereinander lesbar bleiben:
 * Gliederungen tragen ihr eingeführtes Buchstabenkürzel (BGSt, LGS, KV, OV,
 * LO, BO, GG), Fraktionen und Klubs die Ebene plus Gremium (BT-Fraktion,
 * LT-Klub), Mandate und Büros das Gremium selbst (Kreistag, Rat, MdB-Büro).
 *
 * Anzeigetext, kein persistierter Wert — F2, frei umbenennbar.
 */
export const ROLE_SHORT_LABELS: Record<RoleBausteinKey, string> = {
  'eu-abgeordnete': 'MdEP',
  'eu-abgeordnetenbuero': 'MdEP-Büro',
  europagruppe: 'Europagruppe',
  bundesgeschaeftsstelle: 'BGSt',
  bundestagsfraktion: 'BT-Fraktion',
  'mdb-buero': 'MdB-Büro',
  landesgeschaeftsstelle: 'LGS',
  landtagsfraktion: 'LT-Fraktion',
  'mdl-buero': 'MdL-Büro',
  kreisverband: 'KV',
  kreistagsfraktion: 'KT-Fraktion',
  kreistagsmitglied: 'Kreistag',
  ortsverband: 'OV',
  ratsfraktion: 'Ratsfraktion',
  ratsmitglied: 'Rat',
  'presse-social-media': 'Presse',
  'at-bundespartei': 'Bundespartei',
  'at-gruener-klub': 'NR-Klub',
  'at-nr-abgeordnetenbuero': 'NR-Büro',
  'at-landesorganisation': 'LO',
  'at-landtagsklub': 'LT-Klub',
  'at-lt-abgeordnetenbuero': 'LT-Büro',
  'at-bezirksorganisation': 'BO',
  'at-bezirksraetin': 'BR',
  'at-gemeindegruppe': 'GG',
  'at-gemeinderaetin': 'GR',
  'gj-bundesverband': 'GJ Bund',
  'gj-landesverband': 'GJ Land',
  'gj-vor-ort': 'GJ vor Ort',
  'at-gj-bundesorganisation': 'GJÖ Bund',
  'at-gj-landesorganisation': 'GJÖ Land',
  'at-gj-vor-ort': 'GJÖ vor Ort',
};

/**
 * Die Kurzform einer Rolle. Frei eingetippte Rollen haben keinen Baustein und
 * damit kein Kürzel — für sie fällt die Anzeige auf die Bezeichnung ohne das
 * vorangestellte „Mitarbeiter*in" zurück; die bleibt beliebig lang, das UI
 * kürzt sie weiter.
 */
export function roleShortLabel(ebene: string, rolle: string): string {
  const key = roleBausteinKey(ebene, rolle);
  if (key) return ROLE_SHORT_LABELS[key];
  return rolle.replace(/^Mitarbeiter\*in\s+/u, '').trim() || rolle;
}
