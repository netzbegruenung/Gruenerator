/**
 * Landesverband (LV) scope resolution for example searches.
 *
 * A press-example search must be scoped to one Landesverband, otherwise the
 * composer mimics PMs from the wrong LV (e.g. a Brandenburg agent producing a
 * Hessen press release). The LV signal can arrive two ways:
 *   1. on the agent itself — `toolRestrictions.examplesLvScope` (explicit) or
 *      `defaultFilter.landesverband` (per-LV PR agents), or
 *   2. via the active notebook/collection scope — the same `landesverband` that
 *      document search already derives from a collection's default filter.
 *
 * This is the single source of truth so every PM-example path applies the LV
 * identically. Seit der Stilllegung von `pressemitteilung_examples` ist das nur
 * noch EIN Pfad — das AI-SDK-Werkzeug `gruenerator_pressemitteilung_examples`,
 * das `@pressemitteilungen` im Loop festzurrt und der Board-Agent ebenfalls
 * ruft; der PM-Arm im ChatGraph-Suchknoten ist mit dem Verdikt weg. Die Quelle
 * bleibt geteilt, weil der Suchknoten sie für die SOCIAL-Beispiele
 * weiterbenutzt. The agent's own scope always
 * wins; the collection-derived scope is a fallback so a generic agent bound to
 * an LV notebook still grounds in the right LV.
 */

import { type LvEbene, lvEbeneForSkillMention } from '@gruenerator/shared/agents';

import { COLLECTION_MAP } from '../../../config/collectionMap.js';
import { getCollectionDefaultFilter } from '../../../config/systemCollectionsConfig.js';

import type { AgentConfig } from './types.js';

/**
 * Map chat-facing collection keys (e.g. `brandenburg`) to their `landesverband`
 * short-code(s) by reusing the system collection's `defaultFilter` — the exact
 * filter document search already applies. Non-LV collections (deutschland,
 * kommunalwiki, …) carry no `landesverband` default and contribute nothing, so
 * a federal notebook correctly yields no LV scope. Returns `undefined` when no
 * collection resolves to an LV.
 */
function deriveLvFromCollections(
  collectionIds: readonly string[] | undefined
): string[] | undefined {
  if (!collectionIds || collectionIds.length === 0) return undefined;
  const codes = new Set<string>();
  for (const collection of collectionIds) {
    const mapping = COLLECTION_MAP[collection];
    if (!mapping) continue;
    const defaultFilter = getCollectionDefaultFilter(mapping.systemId);
    if (!defaultFilter || defaultFilter.field !== 'landesverband') continue;
    if (Array.isArray(defaultFilter.value)) {
      for (const v of defaultFilter.value) codes.add(v);
    } else {
      codes.add(defaultFilter.value);
    }
  }
  return codes.size > 0 ? [...codes] : undefined;
}

/**
 * Resolve the Landesverband scope for an example search: the agent's explicit
 * scope first, then the LV implied by the active notebook/collection scope.
 * Returns `undefined` when no LV applies (federal/Austrian agents and notebooks).
 */
export function resolveExamplesLvScope(
  agentConfig: Pick<AgentConfig, 'toolRestrictions' | 'defaultFilter'>,
  scope?: {
    notebookCollectionIds?: readonly string[];
    defaultNotebookCollectionIds?: readonly string[];
  }
): string | readonly string[] | undefined {
  const fromAgent =
    agentConfig.toolRestrictions?.examplesLvScope ?? agentConfig.defaultFilter?.landesverband;
  if (fromAgent !== undefined) return fromAgent;

  // Prefer an explicitly @mentioned notebook scope over the agent's bound
  // default notebook, mirroring the document-search collection priority.
  const collections = scope?.notebookCollectionIds?.length
    ? scope.notebookCollectionIds
    : scope?.defaultNotebookCollectionIds;
  return deriveLvFromCollections(collections);
}

/** Fraktions-PMs liegen im Korpus unter dem LV-Code mit `-F`-Suffix. */
const FRAKTION_SUFFIX = '-F';

/**
 * Schneidet einen LV-Ausschnitt auf eine Ebene zu (`['HE','HE-F']` + Fraktion →
 * `['HE-F']`).
 *
 * Nötig, weil der Ausschnitt am AGENTEN hängt und beide Ebenen umfasst, das
 * Rezept aber für eine geschrieben ist. Ohne den Zuschnitt erdet sich die
 * hessische Partei-PM in einem Korpus aus 166 Partei- und 2.073 Fraktions-PMs,
 * holt also überwiegend das Gegenteil dessen, was sie nachahmen soll.
 *
 * Trifft die Ebene keinen Code, bleibt der volle Ausschnitt stehen: ein
 * einstufiger Landesverband (Brandenburg, Saarland, Thüringen) führt nur den
 * Basiscode, und gar keine Vorlagen wären schlechter als ebenenfremde.
 */
export function narrowLvScopeToEbene(
  scope: string | readonly string[] | undefined,
  ebene: LvEbene | null | undefined
): string | readonly string[] | undefined {
  if (scope === undefined || !ebene) return scope;
  const codes = typeof scope === 'string' ? [scope] : [...scope];
  const wanted = codes.filter((code) =>
    ebene === 'fraktion' ? code.endsWith(FRAKTION_SUFFIX) : !code.endsWith(FRAKTION_SUFFIX)
  );
  return wanted.length === 0 ? scope : wanted;
}

/**
 * Die Ebene, die für diesen Turn gilt — die erste, die eines der aktiven
 * Rezepte nennt. Mehrere Rezepte pro Turn sind erlaubt
 * (`MAX_RECIPES_PER_TURN`), aber nur eines davon ist ein LV-Presserezept;
 * nennt keines eine Ebene, wird nicht zugeschnitten.
 */
export function lvEbeneForMentions(
  mentions: readonly (string | null | undefined)[]
): LvEbene | null {
  for (const mention of mentions) {
    if (!mention) continue;
    const ebene = lvEbeneForSkillMention(mention);
    if (ebene) return ebene;
  }
  return null;
}
