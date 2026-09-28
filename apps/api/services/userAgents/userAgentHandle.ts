const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a user-agent handle is the row uuid rather than the per-owner
 * identifier. Every lookup branches on this before touching `user_agents.id`:
 * a non-uuid string cast to uuid makes Postgres throw.
 */
export function isUserAgentId(handle: string): boolean {
  return UUID_RE.test(handle);
}
