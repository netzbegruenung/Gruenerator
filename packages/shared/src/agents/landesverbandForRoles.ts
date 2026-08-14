/**
 * Welche Landesverbände eine Person vertritt — abgeleitet aus ihren Profilrollen.
 *
 * Der Rollen-Assistent fragt Ebene und Bundesland ohnehin ab und legt beides in
 * `profile.roles[]` ab (`packages/shared/src/roles`). Dieses Modul macht daraus
 * LV-Ids, damit dieselbe Antwort jede LV-bezogene Oberfläche steuert: Agentura,
 * Sidebar-Inventar, Rezept-Bibliothek und die Mention-Liste im Composer.
 *
 * Die Zuteilung ist **ausschließend**: wer keine Landesgeschäftsstellen-Rolle
 * gepflegt hat, sieht die LV-Agenten und -Rezepte nicht. Sie sind Material
 * eines bestimmten Landesverbands, kein allgemeiner Bestand — und ein Regal
 * mit elf fremden Landesverbänden war für alle anderen nur Rauschen.
 *
 * Bewusst **abgeleitet statt gespeichert**: die Relation LV↔Agent↔Rezept steht
 * schon in `LANDESVERBAENDE` und im `identifier`, den jedes Rezept trägt. Es
 * braucht also weder ein neues Feld im Rezept-Frontmatter noch eine Zeile pro
 * Nutzer*in.
 *
 * Wie `audience.ts` regelt das hier **nur die Entdeckung**. `getSystemAgent`,
 * `resolveSkillMention` und `getLandesverbandHubBySlug` bleiben rollenblind, damit
 * geteilte Links und `@`/`/`-Mentions in bestehenden Threads für alle auflösen
 * (URL-Sonderrecht, CLAUDE.md).
 */
import { type RoleBausteinKey, roleBausteinKey } from '../roles/rolesConfig.js';

import { LANDESVERBAENDE } from './landesverbaende.js';
import { SKILLS } from './skills/index.js';
import { VISIBLE_SYSTEM_AGENTS, getSystemAgent } from './system.js';

/**
 * Die Felder einer Profilrolle, die dieses Modul liest. Weiterhin strukturell
 * getippt statt `UserRole` importiert, damit die Agenten nicht am Rollen-Typ
 * hängen. Die reine Funktion `roleBausteinKey` kommt trotzdem aus `roles/` —
 * die Kette `landesverbandForRoles → rolesConfig → landesverbaende` ist
 * azyklisch, und eine zweite Kopie der Rollen→Baustein-Tabelle wäre genau die
 * Zweitkopie, die irgendwann auseinanderläuft.
 */
export interface RoleLandesverbandInput {
  ebene?: string | undefined;
  rolle?: string | undefined;
  bundesland?: string | undefined;
}

/**
 * Nur die Landesgeschäftsstelle leitet einen Landesverband ab — nicht die
 * Landtagsfraktion, nicht das MdL-Büro, und erst recht keine Kreis- oder
 * Ortsverbandsrolle.
 *
 * Über den Baustein-Schlüssel statt über Ebene oder Bezeichnung: der Schlüssel
 * ist der F1-eingefrorene Wert (`ROLE_BAUSTEIN_KEYS`) und trägt die
 * DE/AT-Unterscheidung bereits, während die Bezeichnung nur ein Anzeigename ist
 * und die Ebene drei Rollen zusammenfasst.
 */
const ENTITLING_BAUSTEIN_KEYS: ReadonlySet<RoleBausteinKey> = new Set<RoleBausteinKey>([
  'landesgeschaeftsstelle',
  'at-landesorganisation',
]);

/**
 * Schaltet diese Rollenbezeichnung einen Landesverband frei? Der Rollen-
 * Assistent fragt damit, ob er das Angebot des Landesverbands ankündigen darf —
 * ohne die Regel ein zweites Mal zu formulieren.
 */
export function isLandesverbandRolle(ebene: string, rolle: string): boolean {
  const key = roleBausteinKey(ebene, rolle);
  return key !== null && ENTITLING_BAUSTEIN_KEYS.has(key);
}

function isEntitlingRole(role: RoleLandesverbandInput): boolean {
  if (!role.ebene || !role.rolle) return false;
  return isLandesverbandRolle(role.ebene, role.rolle);
}

/** Österreich ist ein Landesverband; Wien, Tirol & Co. sind es nicht. */
const AT_LANDESVERBAND_ID = 'oesterreich';

const LV_ID_BY_TITLE: ReadonlyMap<string, string> = new Map(
  LANDESVERBAENDE.map((lv) => [lv.title, lv.id])
);

/**
 * LV-Ids, die überhaupt noch einen auffindbaren Agenten haben. Ein Landesverband
 * mit abgeschaltetem Notebook (`enabled: false`) trägt auf seinen Spezialagenten
 * bereits `hiddenFromInventory` (`system.ts`) — die Rollenregel darf ihn nicht
 * wiederbeleben. Deshalb Schnittmenge mit der sichtbaren Menge, nicht Aufschlag
 * darauf.
 */
const DISCOVERABLE_LV_IDS: ReadonlySet<string> = new Set(
  LANDESVERBAENDE.filter((lv) =>
    VISIBLE_SYSTEM_AGENTS.some(
      (agent) =>
        agent.identifier === lv.prAgentId ||
        agent.identifier === lv.buergerAgentId ||
        agent.identifier === lv.wahlpruefsteinAgentId
    )
  ).map((lv) => lv.id)
);

/**
 * Die Landesverbände dieser Person, in Registry-Reihenfolge. Leeres Ergebnis
 * heißt „keine Landesgeschäftsstellen-Rolle" — und damit für jeden Aufrufer:
 * LV-Inhalte **ausblenden**, nicht durchlassen. Wer noch gar nicht weiß, ob
 * Rollen vorliegen (Store nicht hydratisiert, Host ohne Profilzugang), schickt
 * `null` durch die Filter statt einer leeren Liste.
 *
 * Deutsche Rollen ordnen über das Bundesland-Label zu, das per Konstruktion dem
 * `title` der Registry entspricht (`rolesConfig.ts` baut die Auswahlliste daraus).
 * Die österreichische Landesorganisation ordnet dem einen AT-Verband zu, weil
 * die AT-Bundesländer keine eigenen Landesverbände sind.
 */
export function landesverbandIdsForRoles(
  roles: readonly RoleLandesverbandInput[],
  userLocale: string
): readonly string[] {
  const entitlingRoles = roles.filter(isEntitlingRole);
  if (entitlingRoles.length === 0) return [];

  if (userLocale === 'de-AT') {
    return DISCOVERABLE_LV_IDS.has(AT_LANDESVERBAND_ID) ? [AT_LANDESVERBAND_ID] : [];
  }

  const ids = new Set<string>();
  for (const role of entitlingRoles) {
    if (!role.bundesland) continue;
    const id = LV_ID_BY_TITLE.get(role.bundesland);
    if (id !== undefined && DISCOVERABLE_LV_IDS.has(id)) ids.add(id);
  }
  return LANDESVERBAENDE.filter((lv) => ids.has(lv.id)).map((lv) => lv.id);
}

/** Der Landesverband, dem dieser Agenten-Identifier gehört, oder `null`. */
function lvIdForAgentIdentifier(identifier: string): string | null {
  const lv = LANDESVERBAENDE.find(
    (entry) =>
      entry.prAgentId === identifier ||
      entry.buergerAgentId === identifier ||
      entry.wahlpruefsteinAgentId === identifier
  );
  return lv?.id ?? null;
}

/**
 * Soll dieser Agent bzw. dieses Rezept im Inventar auftauchen?
 *
 * Drei Regeln, jede absichtlich:
 * - Identifier ohne Landesverband passieren immer — Aufrufer schicken die ganze
 *   Liste durch diesen Filter, statt sie vorher zu zerlegen.
 * - `lvIds === null` heißt „die Rollen sind noch nicht bekannt" (Store nicht
 *   hydratisiert, Host ohne Profilzugang). Dann wird nicht gefiltert: eine
 *   Ladephase darf nichts wegnehmen, was gleich wieder erscheint.
 * - `lvIds` leer heißt dagegen „geprüft, keine Landesgeschäftsstellen-Rolle" —
 *   und dann sind LV-Inhalte nicht sichtbar. Die Zuteilung ist der Zugang; ohne
 *   sie gibt es ihn nicht.
 */
export function isLvItemVisibleForRoles(
  identifier: string,
  lvIds: readonly string[] | null
): boolean {
  if (lvIds === null) return true;
  const lvId = lvIdForAgentIdentifier(identifier);
  if (lvId === null) return true;
  return lvIds.includes(lvId);
}

/**
 * Soll dieses Notebook in einem Picker angeboten werden? Gleiche Semantik wie
 * {@link isLvItemVisibleForRoles}: Nicht-LV-Notebooks und der noch unbekannte
 * Fall passieren immer, die geprüft-rollenlose Person sieht keine LV-Notizbücher.
 */
export function isLvNotebookVisibleForRoles(
  notebookId: string,
  lvIds: readonly string[] | null
): boolean {
  if (lvIds === null) return true;
  const lv = LANDESVERBAENDE.find((entry) => entry.notebookId === notebookId);
  if (!lv) return true;
  return lvIds.includes(lv.id);
}

/**
 * Die `mention`s der Rezepte aus den eigenen Landesverbänden, kleingeschrieben —
 * das Format, in dem der Favoriten-Store sie hält. Rezepte, deren Agent
 * ausgeblendet ist, bleiben draußen: was nichts rendert, wird auch nicht
 * vorgemerkt.
 */
export function lvSkillMentionsForRoles(
  roles: readonly RoleLandesverbandInput[],
  userLocale: string
): readonly string[] {
  const lvIds = landesverbandIdsForRoles(roles, userLocale);
  if (lvIds.length === 0) return [];

  return SKILLS.filter(
    (skill) =>
      isLvItemVisibleForRoles(skill.identifier, lvIds) &&
      lvIdForAgentIdentifier(skill.identifier) !== null &&
      getSystemAgent(skill.identifier)?.hiddenFromInventory !== true
  ).map((skill) => skill.mention.toLowerCase());
}

/**
 * Was ein Landesverband tatsächlich mitbringt. Der Rollen-Assistent zeigt das
 * beim Auswählen des Bundeslands an — bisher stand dort nur „● Notebook", was
 * die eigentliche Zuteilung (Agenten und Rezepte) verschwieg und obendrein aus
 * einer handgepflegten Liste kam.
 */
export interface LandesverbandOffer {
  lvId: string;
  title: string;
  /** Auffindbare Spezialagenten (Öffentlichkeitsarbeit, Bürger*innen, Wahlprüfsteine). */
  agents: number;
  /** Rezepte, die einem dieser Agenten gehören. */
  skills: number;
  /** Das LV-Notizbuch. Immer gesetzt: ein LV mit abgeschaltetem Notebook hat
   *  keine auffindbaren Agenten und kommt hier gar nicht erst an. */
  notebookId: string;
}

/**
 * Das Angebot zu einem Bundesland-Label, oder `null` für Länder ohne eigenen
 * Landesverband (Baden-Württemberg, Bremen, Niedersachsen, NRW,
 * Rheinland-Pfalz) und für solche, deren Agenten abgeschaltet sind.
 */
export function landesverbandOfferForBundesland(bundesland: string): LandesverbandOffer | null {
  const lvId = LV_ID_BY_TITLE.get(bundesland);
  if (lvId === undefined || !DISCOVERABLE_LV_IDS.has(lvId)) return null;

  const lv = LANDESVERBAENDE.find((entry) => entry.id === lvId);
  if (!lv) return null;

  const agentIds: readonly string[] = [lv.prAgentId, lv.buergerAgentId, lv.wahlpruefsteinAgentId];
  const agents = agentIds.filter((id) =>
    VISIBLE_SYSTEM_AGENTS.some((agent) => agent.identifier === id)
  ).length;
  const skills = SKILLS.filter(
    (skill) =>
      agentIds.includes(skill.identifier) &&
      getSystemAgent(skill.identifier)?.hiddenFromInventory !== true
  ).length;

  return { lvId, title: lv.title, agents, skills, notebookId: lv.notebookId };
}

/** Anzeigename zu einer LV-Id, z. B. `'hessen'` → `'Hessen'`. */
export function landesverbandTitle(lvId: string): string | null {
  return LANDESVERBAENDE.find((lv) => lv.id === lvId)?.title ?? null;
}

/**
 * Überschriften für den Landesverbands-Abschnitt eines Inventars. Sobald das
 * Regal persönlich ist, ist „Landesverbände" das falsche Wort für genau einen —
 * beide Plattformen holen ihre Formulierung hier, statt jede ihre eigene Beugung
 * zu erfinden.
 */
export function landesverbandHeadings(lvIds: readonly string[] | null): {
  agents: string;
  skills: string;
} {
  const titles = (lvIds ?? []).map(landesverbandTitle).filter((t): t is string => t !== null);
  if (titles.length === 1) {
    return { agents: `Grüne ${titles[0]}`, skills: `Rezepte aus ${titles[0]}` };
  }
  if (titles.length > 1) {
    return { agents: 'Deine Landesverbände', skills: 'Rezepte deiner Landesverbände' };
  }
  return { agents: 'Landesverbände', skills: 'Rezepte der Landesverbände' };
}
