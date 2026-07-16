/**
 * Loop feature flag in a zero-import module so the classifier (agents layer)
 * can read it without pulling in the respond service (which imports ChatGraph
 * nodes → import cycle).
 */
export function isAgenticLoopEnabled(): boolean {
  return process.env.CHAT_AGENT_LOOP === 'true';
}

/**
 * Structured cross-turn MCP replay (Phase 2). Default OFF: feeding reconstructed
 * tool-call/tool-result messages into the live prompt needs a runtime smoke test
 * against the provider first. Enable with CHAT_MCP_REPLAY=true once validated.
 */
export function isMcpReplayEnabled(): boolean {
  return process.env.CHAT_MCP_REPLAY === 'true';
}
