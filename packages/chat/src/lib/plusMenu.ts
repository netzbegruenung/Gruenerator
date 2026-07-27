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
  getMentionLocale,
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
 */
export function functionMentionables(): Mentionable[] {
  const locale = getMentionLocale();
  return toolMentionables.filter(
    (m) => m.audience === undefined || m.audience === 'all' || m.audience === locale
  );
}

/** Connected MCP servers, pinnable to hold their scope across follow-ups. */
export function connectorMentionables(): Mentionable[] {
  return getMcpServerMentionables();
}

/** `mcp:<id>` → the bare server id the pinned-connector state stores. */
export function connectorId(connector: Mentionable): string {
  return connector.identifier.slice(4);
}
