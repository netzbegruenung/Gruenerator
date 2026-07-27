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
  getAgentMentionables,
  getCustomAgentMentionables,
  getMcpServerMentionables,
  getTextformMentionables,
  toolMentionables,
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
  // Deduplicated by identifier: a saved copy of a system agent appears in both
  // lists, and both platforms key their rows by it.
  const seen = new Set<string>();
  return [...agents, ...getCustomAgentMentionables(), ...getTextformMentionables()].filter(
    (item) => !seen.has(item.identifier) && seen.add(item.identifier)
  );
}

/** Built-in chat functions (`@bild`, `@tabelle`, …). */
export function functionMentionables(): Mentionable[] {
  return toolMentionables;
}

/** Connected MCP servers, pinnable to hold their scope across follow-ups. */
export function connectorMentionables(): Mentionable[] {
  return getMcpServerMentionables();
}

/** `mcp:<id>` → the bare server id the pinned-connector state stores. */
export function connectorId(connector: Mentionable): string {
  return connector.identifier.slice(4);
}
