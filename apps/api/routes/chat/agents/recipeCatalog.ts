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
 *   - the user's own "Texte anlernen" forms (body = the learned style block)
 *
 * A user form with the same mention as a system recipe is an override, not a
 * second entry — the same precedence `buildSystemMessage` applies for an
 * explicitly picked recipe.
 */
import {
  DISABLED_LV_AGENT_IDS,
  canonicalSkillMention,
  SKILLS,
  type RoleLandesverbandInput,
  type Skill,
  isLvItemVisibleForRoles,
  landesverbandIdsForRoles,
  matchesRecipeAudience,
} from '@gruenerator/shared/agents';

import { deriveTextFormMention } from '../../../agents/langgraph/ChatGraph/nodes/textFormMention.js';
import { getInternalSkillPrompt } from '../../../services/skills/internalPrompts.js';
import {
  getTextFormForInjection,
  listTextForms,
} from '../../../services/user/textFormRepository.js';
import { createLogger } from '../../../utils/logger.js';
import { embedUntrusted } from '../services/untrustedContent.js';

const log = createLogger('recipeCatalog');

export interface RecipeCatalogEntry {
  mention: string;
  title: string;
  description: string;
  source: 'system' | 'user';
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
}): Promise<RecipeCatalogEntry[]> {
  const { userLocale, userId, roles } = params;
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
        isLvItemVisibleForRoles(s.identifier, lvIds)
    )
    .map((s) => ({
      mention: s.mention,
      title: s.title,
      description: s.description,
      source: 'system' as const,
    }));

  if (!userId) return system;

  let user: RecipeCatalogEntry[] = [];
  try {
    user = (await listTextForms(userId))
      // Presets override a system recipe's body; they are not separate menu
      // entries. Custom and group-shared forms are the ones the model cannot
      // otherwise know about.
      .filter((f) => f.kind === 'custom')
      .map((f) => ({
        mention: f.mention,
        title: f.title,
        description: f.sharedFromGroup
          ? `Angelernte Textform aus dem Projekt „${f.sharedFromGroup}".`
          : 'Selbst angelernte Textform.',
        source: 'user' as const,
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

export interface ResolvedRecipe {
  title: string;
  body: string;
  source: 'system' | 'user';
}

/**
 * Fetch a recipe body. Same precedence `buildSystemMessage` uses: a user's
 * learned form wins over the shipped prompt, and an LV variant folds onto the
 * general text form (`presse-bayern` → the user's `presse` style).
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
  const { mention, userId } = params;
  const skill = SKILLS.find((s) => s.mention === canonicalSkillMention(mention));

  if (userId) {
    const textFormMention = deriveTextFormMention(mention, skill);
    if (textFormMention) {
      const form = await getTextFormForInjection(userId, textFormMention);
      if (form) {
        return {
          title: skill?.title ?? form.title,
          // User-authored text reaching a system prompt without the user
          // deliberately picking it this turn — fenced like every other
          // untrusted source, same as the profile instructions.
          body: embedUntrusted('nutzer_anweisung', form.styleBlock),
          source: 'user',
        };
      }
    }
  }

  if (!skill) return null;
  const internal = getInternalSkillPrompt(skill.mention);
  if (!internal) return null;
  return { title: skill.title, body: internal, source: 'system' };
}
