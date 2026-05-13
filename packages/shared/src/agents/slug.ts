import { getSystemAgent } from './system.js';

const AGENT_ID_PREFIX = 'gruenerator-';

/**
 * Convert an agent identifier to its URL slug form by stripping the
 * `gruenerator-` registry prefix. Used when generating `/chat?agent=…` URLs
 * so the browser bar shows `?agent=oeffentlichkeitsarbeit` instead of the
 * verbose `?agent=gruenerator-oeffentlichkeitsarbeit`.
 *
 * Identifiers without the prefix (user-defined agents) pass through unchanged.
 */
export function getAgentSlug(identifier: string): string {
  return identifier.startsWith(AGENT_ID_PREFIX)
    ? identifier.slice(AGENT_ID_PREFIX.length)
    : identifier;
}

/**
 * Resolve a URL slug back to a system agent identifier.
 *
 * - If `slug` already carries the `gruenerator-` prefix (legacy URL), return
 *   it unchanged — backwards-compatible with bookmarks predating the slug
 *   refactor.
 * - Otherwise re-prefix and verify a system agent exists; if so, return the
 *   full identifier. If no system agent matches, return the slug as-is so
 *   user-defined agents (whose identifiers don't follow the registry
 *   convention) still route correctly.
 */
export function resolveAgentSlug(slug: string): string {
  if (slug.startsWith(AGENT_ID_PREFIX)) return slug;
  const candidate = `${AGENT_ID_PREFIX}${slug}`;
  return getSystemAgent(candidate) ? candidate : slug;
}
