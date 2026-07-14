/**
 * Loop feature flag in a zero-import module so the classifier (agents layer)
 * can read it without pulling in the respond service (which imports ChatGraph
 * nodes → import cycle).
 */
export function isAgenticLoopEnabled(): boolean {
  // test-branch: loop ON by default so it can be exercised live without env
  // config. An explicit CHAT_AGENT_LOOP=false still disables it (escape hatch).
  // NOTE: this differs from the master-bound PR, which keeps the opt-in
  // (=== 'true'); do not carry this default to prod without a deliberate flip.
  return process.env.CHAT_AGENT_LOOP !== 'false';
}
