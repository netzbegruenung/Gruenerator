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
