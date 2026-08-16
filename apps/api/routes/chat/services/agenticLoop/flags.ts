/**
 * Loop feature flag in a zero-import module so the classifier (agents layer)
 * can read it without pulling in the respond service (which imports ChatGraph
 * nodes → import cycle).
 *
 * Der Zyklusbrecher bleibt nötig, und `routing.ts` ist NICHT sein natürlicher
 * Ort: dessen Kopfkommentar verspricht Reinheit (keine Express-, keine
 * Umgebungs-Abhängigkeit), damit die Entscheidungstabelle isoliert prüfbar
 * bleibt. Ein `process.env`-Zugriff dort nähme genau das zurück. Beide Leser —
 * Klassifikator und `routingStage` — importieren deshalb von hier; der
 * Durchreich-Export über `agenticRespondService` ist entfallen.
 */
export function isAgenticLoopEnabled(): boolean {
  // Default ON. The loop is the path where a factual turn actually calls a
  // tool; single-pass is the fallback, not the norm. It was opt-in while it
  // stabilised, but the variable then appeared in neither `.env` nor
  // `.env.example` — so "the loop is on" was an assumption nothing in the repo
  // supported, and every fix written for the loop was dead where it mattered.
  // Opt out with CHAT_AGENT_LOOP=false (no redeploy needed).
  return process.env.CHAT_AGENT_LOOP !== 'false';
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
