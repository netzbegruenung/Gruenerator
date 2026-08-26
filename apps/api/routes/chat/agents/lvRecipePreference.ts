/**
 * Bevorzugt die Landesverbands-Variante eines generischen Rezepts.
 *
 * Zwei Signale, in dieser Reihenfolge:
 *   1. Der Agent selbst — auf einem LV-PR-Agenten (per Link oder Inventar) ist
 *      dessen eigene Rezept-Variante immer die richtige, unabhängig von den
 *      Profilrollen der Person.
 *   2. Die Profilrollen — wer genau EINEN Landesverband vertritt
 *      (Landesgeschäftsstellen-Rolle, `landesverbandIdsForRoles`), bekommt auf
 *      generischen Agenten die Variante dieses Verbands. Mehrere Verbände sind
 *      mehrdeutig, dann bleibt das generische Rezept stehen.
 *
 * Die Zuordnung generisch→LV läuft über die Rezept-Familie, nicht über
 * Namenskonventionen: `presse` ↔ Kategorie `presse`, `instagram` ↔ Kategorie
 * `social` (LV-Agenten führen als Social-Rezept ausschließlich die
 * Insta-Variante). Andere generische Rezepte (facebook, twitter, reel, …)
 * haben keine LV-Varianten und stehen deshalb nicht in der Tabelle. Bei
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
  type RoleLandesverbandInput,
  type Skill,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

import { CURRENT_INSTANCE } from '../../../config/instance.js';

/** Rezept-Familie je generischer Mention — nur Familien MIT LV-Varianten. */
const LV_FAMILY_BY_GENERIC_MENTION: Readonly<Record<string, string>> = {
  presse: 'presse',
  instagram: 'social',
};

export function preferredLvRecipeMention(params: {
  /** Die generisch gewählte Mention (`presse`, `instagram`, …). */
  mention: string | null | undefined;
  /** Der Agent des Turns — LV-PR-Agenten binden die Wahl an sich. */
  agentIdentifier?: string | null;
  /** Profilrollen der Person; greifen nur auf Nicht-LV-Agenten. */
  roles?: readonly RoleLandesverbandInput[] | null;
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
  const { mention, agentIdentifier, roles, userLocale } = params;
  const instanceId = params.instanceId ?? CURRENT_INSTANCE;
  if (!mention) return null;
  const family = LV_FAMILY_BY_GENERIC_MENTION[mention.toLowerCase()];
  if (!family) return null;

  // Ein LV-Agent bindet die Wahl an sich — auch dann, wenn er selbst keine
  // Variante dieser Familie führt (SH, Sachsen): sonst bekäme eine Person mit
  // Hessen-Rolle auf dem SH-Agenten hessische Schreibvorgaben.
  let ownerId: string | null = null;
  if (agentIdentifier && LANDESVERBAENDE.some((lv) => lv.prAgentId === agentIdentifier)) {
    ownerId = agentIdentifier;
  } else {
    const lvIds = landesverbandIdsForRoles(roles ?? [], userLocale ?? 'de-DE');
    if (lvIds.length === 1) {
      ownerId = LANDESVERBAENDE.find((lv) => lv.id === lvIds[0])?.prAgentId ?? null;
    }
  }
  if (!ownerId || DISABLED_LV_AGENT_IDS.has(ownerId)) return null;

  // `SKILLS` is `as const`; entries without `lvEbene` reject the property —
  // widen to the declared interface (same move as recipeCatalog).
  const allSkills: readonly Skill[] = SKILLS;
  const candidates = allSkills.filter(
    (s) =>
      s.identifier === ownerId &&
      s.skillCategory === family &&
      s.lvEbene !== 'fraktion' &&
      isSkillOfferedIn(s, instanceId)
  );
  if (candidates.length !== 1) return null;
  const preferred = candidates[0]?.mention ?? null;
  return preferred !== null && preferred.toLowerCase() === mention.toLowerCase() ? null : preferred;
}

/**
 * Der `defaultRecipeMention`-Rückfall eines Agenten, LV-bewusst: auf einem
 * generischen Agenten mit generischem Default bekommt eine Person mit genau
 * einer Landesverbands-Rolle die LV-Variante. Kuratierte LV-Defaults
 * (`presse-hessen-partei`, `presse-saarland`) stehen nicht in der Familien-
 * Tabelle und passieren unverändert.
 */
export function roleAwareDefaultRecipeMention(
  agentConfig: { identifier?: string | undefined; defaultRecipeMention?: string | undefined },
  ctx: {
    userRoles?: readonly RoleLandesverbandInput[] | null | undefined;
    userLocale?: string | null | undefined;
  }
): string | null {
  const base = agentConfig.defaultRecipeMention ?? null;
  if (!base) return null;
  return (
    preferredLvRecipeMention({
      mention: base,
      agentIdentifier: agentConfig.identifier ?? null,
      roles: ctx.userRoles ?? null,
      userLocale: ctx.userLocale ?? null,
    }) ?? base
  );
}
