/**
 * Loop feature flag in a zero-import module so the classifier (agents layer)
 * can read it without pulling in the respond service (which imports ChatGraph
 * nodes → import cycle).
 */
export function isAgenticLoopEnabled(): boolean {
  return process.env.CHAT_AGENT_LOOP === 'true';
}

/**
 * Structured cross-turn MCP replay (Phase 2). Default ON — the reconstruction is
 * pure + unit-tested and the injection is defensive (a build/loader error is
 * swallowed, so a bad replay can never break the turn). Opt out per env with
 * CHAT_MCP_REPLAY=false if it ever misbehaves in prod (no redeploy needed).
 */
export function isMcpReplayEnabled(): boolean {
  return process.env.CHAT_MCP_REPLAY !== 'false';
}

export type EditToolSurface = 'doc' | 'sheet' | 'presentation' | 'board' | 'canvas';

const ALL_EDIT_TOOL_SURFACES: readonly EditToolSurface[] = [
  'doc',
  'sheet',
  'presentation',
  'board',
  'canvas',
];

/**
 * Per-surface rollout of the tool-based editing path (the agentic loop plans ops
 * and streams an `editor_operations` event, replacing the client round-trip to
 * the bespoke /api/{sheets,presentations,boards}/:id/ai endpoint).
 *
 * `CHAT_EDIT_TOOL_SURFACES` is a comma list (`sheet,presentation`) or `all`.
 * Requires CHAT_AGENT_LOOP=true (the tool only exists inside the loop). Empty /
 * unset → the legacy trigger_doc_edit path stays in force for every surface, so
 * the default is a byte-for-byte no-op.
 */
export function getEditToolSurfaces(): ReadonlySet<EditToolSurface> {
  const raw = process.env.CHAT_EDIT_TOOL_SURFACES?.trim();
  if (!raw) return new Set();
  if (raw === 'all') return new Set(ALL_EDIT_TOOL_SURFACES);
  const valid = new Set<EditToolSurface>();
  for (const part of raw.split(',')) {
    const token = part.trim() as EditToolSurface;
    if (ALL_EDIT_TOOL_SURFACES.includes(token)) valid.add(token);
  }
  return valid;
}
