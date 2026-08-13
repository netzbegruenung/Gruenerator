/**
 * Welche Landesverbände eine Person vertritt — abgeleitet aus ihren Profilrollen.
 *
 * Der Rollen-Assistent fragt Ebene und Bundesland ohnehin ab und legt beides in
 * `profile.roles[]` ab (`packages/shared/src/roles`). Dieses Modul macht daraus
 * LV-Ids, damit dieselbe Antwort jede LV-bezogene Oberfläche steuert: Agentura,
 * Sidebar-Inventar, Rezept-Bibliothek und die Mention-Liste im Composer.
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
import { LANDESVERBAENDE } from './landesverbaende.js';
import { SKILLS } from './skills/index.js';
import { VISIBLE_SYSTEM_AGENTS, getSystemAgent } from './system.js';

/**
 * Die Felder einer Profilrolle, die dieses Modul liest. Strukturell getippt statt
 * `UserRole` importiert: `roles/types.ts` liegt in einem anderen Teilpaket und
 * soll nicht von den Agenten abhängen (die Abhängigkeit läuft bereits andersherum,
 * `rolesConfig` leitet seine Notebook-Ids aus der LV-Registry ab).
 */
export interface RoleLandesverbandInput {
  ebene?: string | undefined;
  bundesland?: string | undefined;
}

/**
 * Nur die Landesebene leitet einen Landesverband ab. Kreis- und Ortsverbände
 * geben zwar auch ein Bundesland an, arbeiten aber nicht im Landesverband —
 * ihre Zuordnung wäre eine Vermutung, und bei einer *ausschließenden* Regel
 * kostet eine falsche Vermutung den Zugang zum Material.
 */
const LV_EBENE = 'land';

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
 * heißt „keine Zuordnung" — und damit für jeden Aufrufer: **nicht** filtern.
 *
 * Deutsche Rollen ordnen über das Bundesland-Label zu, das per Konstruktion dem
 * `title` der Registry entspricht (`rolesConfig.ts` baut die Auswahlliste daraus).
 * Österreichische Rollen der Ebene „land" ordnen dem einen AT-Verband zu, weil
 * die AT-Bundesländer keine eigenen Landesverbände sind.
 */
export function landesverbandIdsForRoles(
  roles: readonly RoleLandesverbandInput[],
  userLocale: string
): readonly string[] {
  const landRoles = roles.filter((role) => role.ebene === LV_EBENE);
  if (landRoles.length === 0) return [];

  if (userLocale === 'de-AT') {
    return DISCOVERABLE_LV_IDS.has(AT_LANDESVERBAND_ID) ? [AT_LANDESVERBAND_ID] : [];
  }

  const ids = new Set<string>();
  for (const role of landRoles) {
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
 * Zwei Durchlassregeln, beide absichtlich:
 * - Identifier ohne Landesverband passieren immer — Aufrufer schicken die ganze
 *   Liste durch diesen Filter, statt sie vorher zu zerlegen.
 * - `lvIds` leer heißt „keine Rollenangabe", und dann bleibt alles sichtbar wie
 *   bisher. Ohne diese Regel würde die Einführung der Zuteilung jeder Person
 *   ohne gepflegte Rolle sämtliche LV-Inhalte wegnehmen.
 */
export function isLvItemVisibleForRoles(identifier: string, lvIds: readonly string[]): boolean {
  if (lvIds.length === 0) return true;
  const lvId = lvIdForAgentIdentifier(identifier);
  if (lvId === null) return true;
  return lvIds.includes(lvId);
}

/**
 * Soll dieses Notebook in einem Picker angeboten werden? Gleiche Semantik wie
 * {@link isLvItemVisibleForRoles}: Nicht-LV-Notebooks und der rollenlose Fall
 * passieren immer.
 */
export function isLvNotebookVisibleForRoles(notebookId: string, lvIds: readonly string[]): boolean {
  if (lvIds.length === 0) return true;
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
export function landesverbandHeadings(lvIds: readonly string[]): {
  agents: string;
  skills: string;
} {
  const titles = lvIds.map(landesverbandTitle).filter((t): t is string => t !== null);
  if (titles.length === 1) {
    return { agents: `Grüne ${titles[0]}`, skills: `Rezepte aus ${titles[0]}` };
  }
  if (titles.length > 1) {
    return { agents: 'Deine Landesverbände', skills: 'Rezepte deiner Landesverbände' };
  }
  return { agents: 'Landesverbände', skills: 'Rezepte der Landesverbände' };
}
