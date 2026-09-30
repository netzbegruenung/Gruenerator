/**
 * Bevorzugt die Landesverbands-Variante eines generischen Rezepts.
 *
 * Zwei Signale, in dieser Reihenfolge:
 *   1. Der Agent selbst — auf einem LV-Agenten (per Link oder Inventar, gleich
 *      welcher Familie) ist die Rezept-Variante SEINES Landesverbands immer
 *      die richtige, unabhängig von den Profilrollen der Person.
 *   2. Die AKTIVE Rolle — ist die im Chat gewählte Rolle eine
 *      Landesgeschäftsstellen-Rolle (`landesverbandIdsForRoles`), bekommt die
 *      Person die Variante dieses Verbands. Die übrigen gespeicherten Rollen
 *      zählen hier nicht: sie regeln nur, welche LV-Rezepte sichtbar sind
 *      (Zuteilung, `recipeCatalog`). Wer im Composer „Ohne Rolle" wählt, meint
 *      damit auch „nicht als Landesgeschäftsstelle schreiben" — bis 09/2026
 *      bog die gespeicherte Rolle trotzdem jedes `presse` auf die LV-Variante um.
 *
 * Die Zuordnung generisch→LV läuft über die Rezept-Familie, nicht über
 * Namenskonventionen: eine Familie ist eine Rezept-Kategorie plus der
 * LV-Agent, dem die Varianten gehören — `presse` ↔ Kategorie `presse` am
 * PR-Agenten, `instagram` ↔ Kategorie `social` am PR-Agenten (LV-Agenten führen
 * als Social-Rezept ausschließlich die Insta-Variante), `buergermail` ↔
 * Kategorie `dokumente` am Bürger*innenanfragen-Agenten. Andere generische
 * Rezepte (facebook, twitter, reel, …) haben keine LV-Varianten und stehen
 * deshalb nicht in der Tabelle. Bei
 * zweistufigen Verbänden gewinnt die Partei-Ebene — dieselbe Wahl wie
 * `LEGACY_SKILL_MENTIONS` und die `defaultRecipeMention` der PR-Agenten, weil
 * die Rollenzuteilung allein an der Landesgeschäftsstelle hängt. Käme je eine
 * zweite Nicht-Fraktions-Variante derselben Familie dazu, ist die Zuordnung
 * mehrdeutig und die Funktion steht still (Kandidatenzahl ≠ 1).
 *
 * Bewusst NICHT angewandt auf explizit gewählte Mentions (`@presse` im
 * Composer): eine ausdrückliche Wahl wird nicht übersteuert. Die Aufrufer sind
 * die drei automatischen Türen — implizites Rezept (routingStage),
 * `rezept_laden` im Loop (catalogAssembly) und der `defaultRecipeMention`-
 * Rückfall (respondNode/searchNode via `roleAwareDefaultRecipeMention`).
 */
import {
  DISABLED_LV_AGENT_IDS,
  LANDESVERBAENDE,
  SKILLS,
  isSkillOfferedIn,
  landesverbandIdsForRoles,
  lvIdForAgentIdentifier,
  type RoleLandesverbandInput,
  type Skill,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

import { CURRENT_INSTANCE } from '../../../config/instance.js';

type LandesverbandRecord = (typeof LANDESVERBAENDE)[number];

interface LvRecipeFamily {
  /** `skillCategory` der LV-Varianten. */
  category: string;
  /** Registry-Feld des LV-Agenten, dem die Varianten gehören. */
  owner: 'prAgentId' | 'buergerAgentId';
}

/** Rezept-Familie je generischer Mention — nur Familien MIT LV-Varianten. */
const LV_FAMILY_BY_GENERIC_MENTION: Readonly<Record<string, LvRecipeFamily>> = {
  presse: { category: 'presse', owner: 'prAgentId' },
  instagram: { category: 'social', owner: 'prAgentId' },
  buergermail: { category: 'dokumente', owner: 'buergerAgentId' },
};

/** Der Landesverband, zu dem ein Agent gehört — gleich welcher LV-Familie. */
function landesverbandOfAgent(agentIdentifier: string): LandesverbandRecord | null {
  const id = lvIdForAgentIdentifier(agentIdentifier);
  return id ? (LANDESVERBAENDE.find((lv) => lv.id === id) ?? null) : null;
}

export function preferredLvRecipeMention(params: {
  /** Die generisch gewählte Mention (`presse`, `instagram`, …). */
  mention: string | null | undefined;
  /** Der Agent des Turns — LV-Agenten binden die Wahl an ihren Landesverband. */
  agentIdentifier?: string | null;
  /** Die im Chat aktive Rolle (aufgelöste `roleRef`); greift nur auf Nicht-LV-Agenten. */
  activeRole?: RoleLandesverbandInput | null;
  userLocale: string | null;
  /**
   * Die Instanz, auf der der Turn läuft. Ein Deployment ohne Landesverbands-
   * Inhalte darf ein generisches Rezept nicht auf eine Variante umbiegen, die
   * es nicht führt — das ist die eine Tür, die das Rollen-Gate der Oberfläche
   * nicht abdeckt: eine Bestandsrolle aus der Zeit vor der Verengung trägt
   * ihren Landesverbands-Anspruch weiter.
   */
  instanceId?: InstanceId;
}): string | null {
  const { mention, agentIdentifier, activeRole, userLocale } = params;
  const instanceId = params.instanceId ?? CURRENT_INSTANCE;
  if (!mention) return null;
  const family = LV_FAMILY_BY_GENERIC_MENTION[mention.toLowerCase()];
  if (!family) return null;

  // Ein LV-Agent bindet die Wahl an seinen Landesverband — auch dann, wenn
  // der keine Variante dieser Familie führt (SH, Sachsen): sonst bekäme eine
  // Person mit Hessen-Rolle auf dem SH-Agenten hessische Schreibvorgaben.
  let lv: LandesverbandRecord | null = agentIdentifier
    ? landesverbandOfAgent(agentIdentifier)
    : null;
  if (!lv) {
    const lvIds = landesverbandIdsForRoles(activeRole ? [activeRole] : [], userLocale ?? 'de-DE');
    if (lvIds.length === 1) {
      lv = LANDESVERBAENDE.find((entry) => entry.id === lvIds[0]) ?? null;
    }
  }
  const ownerId = lv?.[family.owner] ?? null;
  if (!ownerId || DISABLED_LV_AGENT_IDS.has(ownerId)) return null;

  // `SKILLS` is `as const`; entries without `lvEbene` reject the property —
  // widen to the declared interface (same move as recipeCatalog).
  const allSkills: readonly Skill[] = SKILLS;
  const candidates = allSkills.filter(
    (s) =>
      s.identifier === ownerId &&
      s.skillCategory === family.category &&
      s.lvEbene !== 'fraktion' &&
      isSkillOfferedIn(s, instanceId)
  );
  if (candidates.length !== 1) return null;
  const preferred = candidates[0]?.mention ?? null;
  return preferred !== null && preferred.toLowerCase() === mention.toLowerCase() ? null : preferred;
}

/**
 * Der `defaultRecipeMention`-Rückfall eines Agenten, LV-bewusst: auf einem
 * generischen Agenten mit generischem Default bekommt eine Person mit aktiver
 * Landesgeschäftsstellen-Rolle die LV-Variante. Kuratierte LV-Defaults
 * (`presse-hessen-partei`, `presse-saarland`) stehen nicht in der Familien-
 * Tabelle und passieren unverändert.
 */
export function roleAwareDefaultRecipeMention(
  agentConfig: { identifier?: string | undefined; defaultRecipeMention?: string | undefined },
  ctx: {
    activeRole?: RoleLandesverbandInput | null | undefined;
    userLocale?: string | null | undefined;
  }
): string | null {
  const base = agentConfig.defaultRecipeMention ?? null;
  if (!base) return null;
  return (
    preferredLvRecipeMention({
      mention: base,
      agentIdentifier: agentConfig.identifier ?? null,
      activeRole: ctx.activeRole ?? null,
      userLocale: ctx.userLocale ?? null,
    }) ?? base
  );
}

/**
 * Das Rezept, das ein Ein-Rezept-LV-Agent im agentischen Loop VORAB lädt.
 *
 * Der Loop ignoriert `defaultRecipeMention` und überlässt die Wahl dem Modell
 * über `rezept_laden` — für einen Agenten, der genau eine Textsorte schreibt
 * (Bürger*innenanfragen), heißt das: das Rezept kommt selten an,
 * weil die kleinen Loop-Modelle das Werkzeug überspringen. Solche Agenten
 * bekommen es deshalb deterministisch.
 *
 * „Ein-Rezept" ist wörtlich gemeint: dem Agenten gehört genau EIN Rezept, und
 * es ist sein Default. Ein LV-PR-Agent führt Presse UND Insta — ein vorab
 * geladenes Presserezept stünde neben einem selbst gewählten Insta-Rezept, zwei
 * Formatgeber auf einem Text. Er bleibt beim Selbstladen.
 */
export function ownedLvDefaultRecipeMention(
  agentConfig: { identifier?: string | undefined; defaultRecipeMention?: string | undefined },
  instanceId: InstanceId = CURRENT_INSTANCE
): string | null {
  const { identifier, defaultRecipeMention } = agentConfig;
  if (!identifier || !defaultRecipeMention) return null;
  if (!landesverbandOfAgent(identifier) || DISABLED_LV_AGENT_IDS.has(identifier)) return null;
  const allSkills: readonly Skill[] = SKILLS;
  const owned = allSkills.filter(
    (s) => s.identifier === identifier && isSkillOfferedIn(s, instanceId)
  );
  return owned.length === 1 && owned[0]?.mention === defaultRecipeMention
    ? defaultRecipeMention
    : null;
}
