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

/**
 * Cross-Encoder für die Dokumentsuche des Loops (`gruenerator_search`).
 *
 * Default AUS — und damit bewusst die Umkehr der beiden Schalter darüber.
 * Der Anhang-Pfad (`attachedDocuments.ts`) braucht dasselbe Flag aus einem
 * anderen Grund: dort ist es NICHT der Dokument-Zähler, der den Cross-Encoder
 * aussperrt — nach der Gruppierung steht ohnehin nur ein Dokument, eine
 * zweite Stufe bräuchte es also nie. Der Cross-Encoder selbst lief dort schon
 * vor der Gruppierung (`scoreChunksByCrossEncoder`, bis zu 30 Chunks je
 * Dokument) — nur kam der `rerankChunks`-Aufruf seit #2816 nie an: der
 * Validator liess ihn in den geschachtelten Optionen stillschweigend fallen,
 * bis 03e297cca4 das behob. Dieser Schalter hält BEIDE Pfade an derselben
 * Leine: er verändert die Rangfolge JEDER Dokumentsuche im Hauptpfad des
 * Chats und legt eine mit der Planer-Lane und `GreenPTSearchService` geteilte
 * Rate-Limit-Quote drauf; die Wirkung ist bis zum Doppelmesslauf der
 * Retrieval-Eval unbelegt.
 *
 * Einschalten mit LOOP_RERANK_ENABLED=true (ohne Deploy wirksam). Nach einer
 * grünen Messung wird der Default in einem eigenen, einzeiligen PR gedreht —
 * dann ist das Flag der Rückwärtsgang und die Umschaltung steht als eigener
 * Commit in der Historie, statt in einem Umbau mitzureisen.
 */
export function isLoopRerankEnabled(): boolean {
  return process.env.LOOP_RERANK_ENABLED === 'true';
}
