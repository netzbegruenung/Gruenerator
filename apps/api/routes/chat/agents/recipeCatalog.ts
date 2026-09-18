/**
 * The recipe catalogue the model gets to see, and the loader behind it.
 *
 * Progressive disclosure, exactly as the recipe split already stores things:
 * title + description are cheap and always present (public frontmatter), the
 * prompt body is fetched only when the model asks for it. Until now that
 * frontmatter only ever reached the frontend — the model did not know recipes
 * existed at all.
 *
 * Two sources, one list:
 *   - system recipes from `SKILLS` (body read from SKILLS_INTERN_DIR at boot)
 *   - the "Texte anlernen" forms the user can name: their own, the ones shared
 *     into one of their projects, and the public ones (body = the learned style
 *     block)
 *
 * A user form with the same mention as a system recipe is an override, not a
 * second entry — the same precedence `buildSystemMessage` applies for an
 * explicitly picked recipe.
 */
import {
  DISABLED_LV_AGENT_IDS,
  SKILLS,
  type RoleLandesverbandInput,
  type Skill,
  isLvItemVisibleForRoles,
  isSkillOfferedIn,
  landesverbandIdsForRoles,
  matchesRecipeAudience,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

import { CURRENT_INSTANCE } from '../../../config/instance.js';
import {
  resolveRecipeBody,
  type ResolvedRecipeBody,
} from '../../../services/recipes/resolveRecipeBody.js';
import { listMentionableTextForms } from '../../../services/user/textFormRepository.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('recipeCatalog');

export interface RecipeCatalogEntry {
  mention: string;
  title: string;
  description: string;
  source: 'system' | 'user';
  /** Die Zeile hinter dem Eintrag — `null` für ein mitgeliefertes Systemrezept. */
  id: string | null;
}

/**
 * Recipes of a Landesverband that was switched off must not be offered — the
 * same switch `agentsList` applies in the composer. The mention stays
 * resolvable for legacy threads; it is only absent from the menu.
 *
 * Deliberately NOT `hiddenFromInventory`: that flag also marks active-but-
 * unlisted agents (gruenerator-universal, the editor agents), and filtering on
 * it silently dropped `wahlpruefstein` and `aktion` — recipes of the DEFAULT
 * chat agent — from the catalogue.
 */
function ownerIsVisible(identifier: string): boolean {
  return !DISABLED_LV_AGENT_IDS.has(identifier);
}

export async function buildRecipeCatalog(params: {
  userLocale: string | null;
  userId: string | null;
  /**
   * Die Profilrollen der Person. Ohne sie sähe das Modell die LV-Rezepte aller
   * Landesverbände, während sie in Agentura, Bibliothek und Mention-Menü längst
   * an die Landesgeschäftsstellen-Rolle gebunden sind — und würde eine
   * Pressemitteilung „im Stil Grüne Thüringen" anbieten, die es im Menü gar
   * nicht gibt. `null` heißt hier wie im Frontend „nicht bekannt": dann wird
   * nicht gefiltert.
   */
  roles: readonly RoleLandesverbandInput[] | null;
  /**
   * Die Instanz, deren Rezept-Auswahl gilt. Das Modell darf nur laden, was die
   * Oberfläche auch anbietet — sonst schlägt es eine Textform vor, die im
   * Mention-Menü gar nicht steht. Der `rezept_laden`-Enum wird aus dieser Liste
   * gebaut und erbt die Verengung darum von selbst.
   */
  instanceId?: InstanceId;
}): Promise<RecipeCatalogEntry[]> {
  const { userLocale, userId, roles } = params;
  const instanceId = params.instanceId ?? CURRENT_INSTANCE;
  const lvIds = roles ? landesverbandIdsForRoles(roles, userLocale ?? 'de-DE') : null;

  // `SKILLS` is `as const`, so entries without an `audience` key have no such
  // property at all and the union rejects `.audience`. Widen to the declared
  // interface — that is what the field is nominally typed as.
  const allSkills: readonly Skill[] = SKILLS;
  const system: RecipeCatalogEntry[] = allSkills
    .filter(
      (s) =>
        matchesRecipeAudience(s.audience, userLocale) &&
        ownerIsVisible(s.identifier) &&
        isSkillOfferedIn(s, instanceId) &&
        isLvItemVisibleForRoles(s.identifier, lvIds)
    )
    .map((s) => ({
      mention: s.mention,
      title: s.title,
      description: s.description,
      source: 'system' as const,
      id: null,
    }));

  if (!userId) return system;

  let user: RecipeCatalogEntry[] = [];
  try {
    // Dieselbe Liste, die das Mention-Menü anbietet: eigene Textformen, in ein
    // Projekt geteilte und öffentliche — bereits dedupliziert (eigen vor
    // geteilt vor öffentlich) und bereits um die Presets bereinigt, die nur den
    // Rumpf eines Systemrezepts ersetzen. `antrag` bleibt drin: es hat kein
    // mitgeliefertes Rezept, überschreibt also nichts und muss sich selbst
    // eintragen (#2937). Zuvor las diese Stelle `listTextForms` und sah damit
    // nur die eigenen Zeilen — das Modell konnte ein geteiltes Rezept nicht
    // laden, das im Menü danebenstand.
    user = (await listMentionableTextForms(userId)).map((f) => ({
      mention: f.mention,
      title: f.title,
      description:
        f.description ??
        (f.sharedFromGroup
          ? `Angelernte Textform aus dem Projekt \u201e${f.sharedFromGroup}\u201c.`
          : 'Selbst angelernte Textform.'),
      source: 'user' as const,
      id: f.id,
    }));
  } catch (err) {
    // A failed lookup degrades to the system catalogue rather than killing the
    // turn — same posture as a missing SKILLS_INTERN_DIR.
    log.warn('[recipeCatalog] user text forms unavailable, system recipes only:', err);
    return system;
  }

  const userMentions = new Set(user.map((f) => f.mention));
  return [...system.filter((s) => !userMentions.has(s.mention)), ...user];
}

/** The prompt block listing what the model may load. */
export function renderRecipeCatalog(entries: readonly RecipeCatalogEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map((e) => `- ${e.mention}: ${e.title} — ${e.description}`);
  return [
    '',
    '',
    'VERFÜGBARE REZEPTE (Schreibvorgaben für bestimmte Textsorten und Plattformen):',
    ...lines,
    'Willst du einen Text in einer dieser Formen schreiben, rufe ZUERST `rezept_laden` mit der passenden Kennung auf und schreibe erst danach. Für Recherche, Rückfragen und normalen Fließtext brauchst du kein Rezept.',
  ].join('\n');
}

/** Was die Werkzeug-Tür (`rezept_laden`) vom Nachschlag braucht. */
export type ResolvedRecipe = Pick<ResolvedRecipeBody, 'title' | 'body' | 'source'>;

/**
 * Rezept-Rumpf für die Werkzeug-Tür. Die Entscheidung — angelernter Stil vor
 * mitgeliefertem Rezepttext, die Mention der Zeile, die Einfassung — trifft
 * `services/recipes/resolveRecipeBody.ts`; hier steht nur noch der Aufruf,
 * damit die drei Wege nicht wieder auseinanderlaufen (#2930, #2937, #2939).
 *
 * Returns null when nothing is available — notably when SKILLS_INTERN_DIR was
 * never rolled out. The caller MUST surface that as a failure: on the
 * single-pass path a missing prompt silently degrades to the agent's base
 * role, which is acceptable; as a tool result it would let the model report
 * "recipe loaded" and then write generically.
 */
export async function resolveRecipe(params: {
  mention: string;
  userId: string | null;
}): Promise<ResolvedRecipe | null> {
  return resolveRecipeBody(params);
}
