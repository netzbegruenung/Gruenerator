/**
 * What the composer's "+" menu offers, independent of how a platform draws it.
 *
 * Web renders these as dropdown submenus (`thread/PlusMenu`), mobile as rows
 * that open a detail list (`ComposerActionSheet`). Both need the SAME set — the
 * menu is the only place several of these mentionables are browsable at all —
 * so the assembly lives here rather than in either renderer. A section added on
 * one platform is a section the other silently lacks; that is exactly how mobile
 * ended up without Rezepte, Funktionen and Konnektoren.
 */

import {
  boardToolMentionables,
  docToolMentionables,
  getAgentMentionables,
  getCustomAgentMentionables,
  getMcpServerMentionables,
  getTextformMentionables,
  presentationToolMentionables,
  sheetToolMentionables,
  visibleToolMentionables,
  type Mentionable,
} from './mentionables';

/**
 * The recipes worth showing without a search: every system default, plus the
 * ones the user starred, plus their own saved agents and learned text forms.
 *
 * @param favorites lowercased mentions from `useSkillFavoritesStore`.
 */
export function quickSkillMentionables(favorites: readonly string[]): Mentionable[] {
  const agents = getAgentMentionables().filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  // Deduplicated by `mention`, which is the unique key — `identifier` is the
  // OWNING AGENT and eighteen skills share eight of them, so deduping on it
  // silently drops every recipe but the first of each agent (Instagram behind
  // Presse, say). A saved copy of a system agent is what actually needs
  // removing, and that collides on the mention.
  const seen = new Set<string>();
  return [...agents, ...getCustomAgentMentionables(), ...getTextformMentionables()].filter(
    (item) => !seen.has(item.mention) && seen.add(item.mention)
  );
}

/**
 * Built-in chat functions (`@recherche`, `@bildgenerieren`, …), filtered for the
 * current locale like the recipes are — `@abgeordnetenwatch` and `@bundestag`
 * are `audience: 'de-DE'` and have no meaning for an Austrian user.
 *
 * The predicate itself lives in `mentionables` so the `@`-typeahead and both
 * plus-menu renderers cannot answer the question differently. They did: this
 * function applied the filter while the web plus-menu and the typeahead read
 * the raw list, so an Austrian user got `@bundestag` offered on web and not on
 * mobile.
 */
export function functionMentionables(): Mentionable[] {
  return visibleToolMentionables();
}

/**
 * Intent categories the "Erstellen" submenu offers: everything whose result is
 * a new artefact.
 *
 * `retrieval` is deliberately absent. Looking something up (`@bundestag`,
 * `@umfragen`, `@verlauf`, `@doku`) is not an action a user picks from a menu of
 * verbs — it is a source, and sources reach the composer by typing `@`. Keeping
 * them here is what made the old "Funktionen" list read as an unsorted pile of
 * nineteen unrelated things.
 *
 * `surface-edit` and `internal` never carry a mention, so they cannot appear.
 */
const CREATION_INTENT_CATEGORIES: readonly string[] = ['generation', 'artifact', 'processing'];

/**
 * The "Erstellen" submenu: locale-filtered generation intents plus the four
 * create-a-surface entries that live outside the intent registry.
 *
 * Those four (`@dokument-erstellen`, `@tabelle-erstellen`,
 * `@praesentation-erstellen`, `@board-erstellen`) were reachable ONLY by typing
 * before — they are `type: 'doc' | 'sheet' | 'presentation' | 'board'`, and the
 * menu only ever rendered `type: 'tool'`. Same act as generating an image, so
 * same list.
 */
export function creationMentionables(): Mentionable[] {
  return [
    ...visibleToolMentionables().filter(
      (m) => m.intentCategory != null && CREATION_INTENT_CATEGORIES.includes(m.intentCategory)
    ),
    ...docToolMentionables.filter((m) => m.identifier === 'dokument-erstellen'),
    ...sheetToolMentionables,
    ...presentationToolMentionables,
    ...boardToolMentionables,
  ];
}

/** Connected MCP servers, pinnable to hold their scope across follow-ups. */
export function connectorMentionables(): Mentionable[] {
  return getMcpServerMentionables();
}

/** `mcp:<id>` → the bare server id the pinned-connector state stores. */
export function connectorId(connector: Mentionable): string {
  return connector.identifier.slice(4);
}
