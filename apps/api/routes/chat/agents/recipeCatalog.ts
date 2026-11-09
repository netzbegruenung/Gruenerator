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
 *   - the "Texte anlernen" forms belonging to the user or shared into one of
 *     their projects (body = the learned style block). Bewusst NICHT der
 *     öffentliche Katalog — siehe `buildRecipeCatalog`.
 *
 * A user form with the same mention as a system recipe is an override, not a
 * second entry — the same precedence `buildSystemMessage` applies for an
 * explicitly picked recipe.
 */
import { type MentionableTextForm } from '@gruenerator/contracts';
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
import {
  listMentionableTextForms,
  listVisibleTextFormsByIds,
} from '../../../services/user/textFormRepository.js';
import { listUserLibrary } from '../../../services/user/userLibraryService.js';
import { createLogger } from '../../../utils/logger.js';
import { MAX_RECIPES_PER_TURN } from '../services/agenticLoop/recipeRegistry.js';

const log = createLogger('recipeCatalog');

export interface RecipeCatalogEntry {
  /**
   * Eindeutiger Enum-Wert für `rezept_laden`. Meist die Mention; ein
   * gespeichertes fremdes Rezept, dessen Mention schon vergeben ist, bekommt
   * `<mention>-<id.slice(0,6)>`, damit beide getrennt ladbar bleiben.
   */
  key: string;
  mention: string;
  title: string;
  description: string;
  source: 'system' | 'user';
  /** Woher der Eintrag kommt: mitgeliefert, eigen, aus einem Projekt, aus der Bibliothek. */
  origin: 'system' | 'own' | 'group' | 'library';
  /** Die Zeile hinter dem Eintrag — `null` für ein mitgeliefertes Systemrezept. */
  id: string | null;
  /** Wem ein fremdes Rezept gehört (Bibliothek, Projekt), sonst `null`. */
  ownerName: string | null;
  /** Empfohlene Loop-Werkzeuge (nur Systemrezepte), auf die montierten gefiltert. */
  recommendedTools?: readonly string[];
}

/** Wie viele gespeicherte Rezepte anderer höchstens im Katalog stehen — jede Zeile kostet Tokens. */
export const LIBRARY_CATALOG_MAX = 30;

const UUID_REF_RE = /^[0-9a-f-]{36}$/i;

/**
 * Fremder Text im Systemprompt: einzeilig (kein Zeilenumbruch, der eine eigene
 * Katalogzeile oder Anweisung vortäuscht), Steuerzeichen raus, auf `maxChars`
 * gekürzt. Gilt für Beschreibung, Titel und Namen aller Nutzer-Rezepte.
 */
export function catalogDescription(raw: string, maxChars = 220): string {
  const flat = raw
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1).trimEnd()}…`;
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

/**
 * Der Platzhalter für eine Zeile ohne eigene Beschreibung. „Selbst angelernt"
 * stimmt nur für die eigenen — bei einer fremden Zeile sagt die Herkunft mehr
 * als ein falscher Besitzanspruch, und sie ist das Einzige, woran das Modell
 * den Eintrag unterscheidet.
 */
function fallbackDescription(form: MentionableTextForm): string {
  const nennung = `Nutzen, wenn ausdrücklich nach \u201e${form.title}\u201c gefragt wird.`;
  if (form.sharedFromGroup)
    return `${form.title} – Rezept aus dem Projekt \u201e${form.sharedFromGroup}\u201c. ${nennung}`;
  if (form.ownerName) return `${form.title} – Rezept von ${form.ownerName}. ${nennung}`;
  return `${form.title} – eigenes Rezept. ${nennung}`;
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

  // Gespeicherte Rezepte ("Zu meinen Grüneratoren"): Systemrezepte stehen als
  // Mention, Nutzerrezepte als uuid. Ein Ausfall der Bibliothek lässt den Rest
  // des Katalogs stehen.
  let libraryRefs: string[] = [];
  if (userId) {
    try {
      libraryRefs = (await listUserLibrary(userId))
        .filter((i) => i.kind === 'recipe')
        .map((i) => i.ref);
    } catch (err) {
      log.warn('[recipeCatalog] user library unavailable, without saved recipes:', err);
    }
  }
  const savedSystem = new Set(libraryRefs.filter((r) => !UUID_REF_RE.test(r)));

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
        // Ein gespeichertes Systemrezept umgeht NUR die Rollen-Bindung der LV-
        // Rezepte — Land und Instanz gelten weiter.
        (isLvItemVisibleForRoles(s.identifier, lvIds) || savedSystem.has(s.mention))
    )
    .map((s) => ({
      key: s.mention,
      mention: s.mention,
      title: s.title,
      description: s.description,
      source: 'system' as const,
      origin: 'system' as const,
      id: null,
      ownerName: null,
      ...(s.recommendedTools ? { recommendedTools: s.recommendedTools } : {}),
    }));

  if (!userId) return system;

  let user: RecipeCatalogEntry[] = [];
  try {
    // Dieselbe Liste, die das Mention-Menü anbietet — aber OHNE den offenen
    // Katalog. Jede Zeile hier wird eine Katalog-Zeile UND ein Wert im
    // `rezept_laden`-Enum, und der Werkzeugkatalog ist ohnehin der grösste
    // Token-Posten des Turns; die öffentlichen Rezepte der ganzen Instanz sind
    // eine Menge, die niemand nach oben begrenzt. Aufgezählt bekommt das Modell
    // darüber hinaus nur, was die Person selbst gespeichert hat (siehe unten,
    // gedeckelt auf `LIBRARY_CATALOG_MAX`); alles andere bleibt über die
    // ausdrückliche Mention (`resolveRecipeBody`) und die Auswahl im Composer
    // erreichbar.
    //
    // Was bleibt: eigene Textformen und die in ein Projekt geteilten, bereits
    // dedupliziert (eigen vor geteilt) und bereits um die Presets bereinigt,
    // die nur den Rumpf eines Systemrezepts ersetzen. Ein Preset ohne
    // mitgeliefertes Rezept bliebe drin, weil es sonst unerreichbar wäre — so
    // stand `antrag`, bis es das Rezept `@antrag` gab (#2937). Zuvor las diese Stelle `listTextForms` und sah
    // nur die eigenen Zeilen — ein geteiltes Rezept stand im Menü und war für
    // das Modell unsichtbar.
    user = (await listMentionableTextForms(userId, undefined, { includePublic: false })).map(
      (f) => {
        const foreign = f.sharedFromGroup != null || f.ownerName != null;
        return {
          key: f.mention,
          mention: f.mention,
          title: catalogDescription(f.title, 120),
          description: catalogDescription(f.description ?? fallbackDescription(f)),
          source: 'user' as const,
          origin: foreign ? ('group' as const) : ('own' as const),
          id: f.id,
          ownerName: f.ownerName ? catalogDescription(f.ownerName, 60) : null,
        };
      }
    );
  } catch (err) {
    // A failed lookup degrades to the system catalogue rather than killing the
    // turn — same posture as a missing SKILLS_INTERN_DIR.
    log.warn('[recipeCatalog] user text forms unavailable, system recipes only:', err);
    return system;
  }

  const userMentions = new Set(user.map((f) => f.mention));
  const merged = [...system.filter((s) => !userMentions.has(s.mention)), ...user];

  const library = await buildLibraryEntries(userId, libraryRefs, merged);
  return [...merged, ...library];
}

/**
 * Die gespeicherten Rezepte anderer (`user_library_items`, Art `recipe`, uuid-
 * Ref) als Katalogzeilen. Sichtbarkeit entscheidet die Abfrage selbst — ein
 * getrashtes, gemeldetes oder zurückgezogenes Rezept fehlt einfach. Die Mention
 * eines fremden Rezepts verdrängt nie eine vorhandene (eigenes `antrag` bleibt
 * eigenes `antrag`); sie bekommt einen eigenen `key`, damit beide ladbar sind.
 * Es zählen die zuletzt gespeicherten.
 */
async function buildLibraryEntries(
  userId: string,
  libraryRefs: readonly string[],
  taken: readonly RecipeCatalogEntry[]
): Promise<RecipeCatalogEntry[]> {
  const ids = libraryRefs.filter((r) => UUID_REF_RE.test(r));
  if (ids.length === 0) return [];
  let forms: Awaited<ReturnType<typeof listVisibleTextFormsByIds>>;
  try {
    forms = await listVisibleTextFormsByIds(userId, ids);
  } catch (err) {
    log.warn('[recipeCatalog] saved recipes unavailable, without them:', err);
    return [];
  }
  const known = new Set(taken.map((e) => e.id).filter((id): id is string => id !== null));
  const byId = new Map(forms.map((f) => [f.id, f]));
  const keys = new Set(taken.map((e) => e.key));
  const out: RecipeCatalogEntry[] = [];
  for (const id of ids) {
    const f = byId.get(id);
    // Schon als eigene oder Projekt-Zeile da — nicht doppelt aufzählen.
    if (!f || known.has(f.id)) continue;
    const key = keys.has(f.mention) ? `${f.mention}-${f.id.slice(0, 6)}` : f.mention;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({
      key,
      mention: f.mention,
      title: catalogDescription(f.title, 120),
      description: catalogDescription(f.description ?? fallbackDescription(f)),
      source: 'user',
      origin: 'library',
      id: f.id,
      ownerName: f.ownerName ? catalogDescription(f.ownerName, 60) : null,
    });
  }
  return out.slice(-LIBRARY_CATALOG_MAX);
}

/** The prompt block listing what the model may load. */
export function renderRecipeCatalog(
  entries: readonly RecipeCatalogEntry[],
  opts: { remaining: number; pinnedTitle: string | null } = {
    remaining: MAX_RECIPES_PER_TURN,
    pinnedTitle: null,
  }
): string {
  if (entries.length === 0) return '';
  const lines = entries.map(
    (e) =>
      `- ${e.key}: ${e.title} — ${e.description}` +
      (e.origin === 'library'
        ? ` (Rezept von ${e.ownerName ?? 'einer anderen Person'}, gespeichert)`
        : '') +
      (e.recommendedTools?.length ? ` (Werkzeuge: ${e.recommendedTools.join(', ')})` : '')
  );
  return [
    '',
    '',
    'VERFÜGBARE REZEPTE (erprobte Vorgehen für bestimmte Aufgaben – Textsorten, Recherche-Methoden, Ideenfindung, Abläufe; die Beschreibung sagt, wann eins passt):',
    ...lines,
    ...(opts.pinnedTitle
      ? [
          `Bereits aktiv: ${opts.pinnedTitle}. Verlangt die Aufgabe zusätzlich eine Recherche oder Prüfung, lade die passende Recherche-Methode dazu.`,
        ]
      : []),
    `Prüfe vor jeder Aufgabe, ob ein Rezept passt, und lade es mit \`rezept_laden\`, bevor du loslegst. Passen mehrere (etwa eine Textsorte und eine Recherche-Methode), lade bis zu ${opts.remaining} – je Aufruf eins. Passt keins, arbeite ohne Rezept.`,
  ].join('\n');
}

/**
 * Die empfohlenen Werkzeuge eines Systemrezepts, beschränkt auf die im Turn
 * montierten — ein Rezept nennt nichts, was der Agent gar nicht hat.
 */
export function recommendedToolsFor(
  mention: string,
  isMounted: (tool: string) => boolean
): readonly string[] {
  const allSkills: readonly Skill[] = SKILLS;
  const skill = allSkills.find((s) => s.mention === mention);
  return (skill?.recommendedTools ?? []).filter(isMounted);
}

/** Was die Werkzeug-Tür (`rezept_laden`) vom Nachschlag braucht. */
export type ResolvedRecipe = Pick<
  ResolvedRecipeBody,
  'id' | 'mention' | 'title' | 'body' | 'source'
>;

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
  mention: string | null;
  /** Die gepinnte Zeile (Agentura-Link, Composer-Auswahl) — schlägt die Mention. */
  recipeId?: string | null;
  userId: string | null;
}): Promise<ResolvedRecipe | null> {
  return resolveRecipeBody(params);
}
