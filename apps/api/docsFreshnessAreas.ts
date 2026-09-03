/**
 * Which doc folders a source change can affect.
 *
 * Split out of `check-docs-freshness.ts` so it can be tested: that script runs
 * `main()` on import and reaches for the Claude Agent SDK, so nothing inside it
 * is reachable from a test. This map has now under-triggered twice in silence
 * (Office, then the provider/energy claims), and the failure mode gives no
 * signal at all — the audit runs, finds no folder, and reports success.
 */

// In-app product tours audited as pseudo-docs under the virtual folder
// "touren/": the step titles/descriptions are UI claims exactly like doc prose,
// they just live in TS modules instead of markdown.
export const TOURS_FOLDER = 'touren';
// The repo-root README is audited as a pseudo-doc under the virtual folder
// "readme/": its feature list, workspace tables, command list and provider
// claims drift against the code exactly like doc prose does.
export const README_FOLDER = 'readme';

// Feature/tutorial docs only — folders that describe the app UI. Content
// archives (archiv, intern) are intentionally excluded: they have nothing to
// verify against code.
export const SCOPE_FOLDERS = [
  'basics',
  'chat',
  'office',
  'wissen',
  'grueneratoren',
  'konto',
  'integrationen',
  'experimente',
] as const;

/**
 * Doc folder → the source dirs its claims are made of.
 *
 * Two jobs, and the second is the load-bearing one:
 *  1. a hint to the audit agent, cutting the search it would otherwise grep for;
 *  2. THE REVERSE MAP for `docs-freshness-pr.yml` — a folder with no entry here
 *     is never reached by the shift-left PR audit, only by the weekly full
 *     scan. Adding a folder to SCOPE_FOLDERS without adding it here therefore
 *     buys half the coverage it looks like it buys; `docsFreshnessAreas.vitest`
 *     asserts the two stay in step.
 *
 * A path listed here must also appear in the `paths:` filter of
 * `docs-freshness-pr.yml`, or the job never starts for a PR that only touches
 * it. GitHub Actions has no YAML anchors, so that list is a second copy.
 */
export const AREA_HINTS: Record<string, string> = {
  // "Was kann ich fragen?" is verified against the chat's own registries, so the
  // backend classifier/router dirs count as source for this folder too.
  // `services/ai` is here for ki-modelle.md, which names the hosts behind the
  // three size tiers: that claim lives in neither routes/chat nor the
  // ChatGraph, it is decided in `providers.ts` / `providerInstances.ts`.
  chat: 'packages/chat, apps/web/src/features/chat, apps/web/src/features/models, apps/api/routes/chat, apps/api/agents/langgraph/ChatGraph, apps/api/services/ai, packages/contracts/src/schemas',
  // The self-description articles (Nachhaltigkeit, Datenschutz) make provider
  // and energy claims: which model runs at which host, measured Wh/CO₂ per
  // request. In SCOPE_FOLDERS from the start, so the weekly scan covered it —
  // but with no hint the PR audit never did, which is the half that matters:
  // the claim drifts in the same PR that moves the routing.
  basics:
    'apps/api/services/ai, apps/api/services/usage/energyFootprint.ts, apps/api/services/transcription, apps/api/services/voice, packages/core/src/models',
  grueneratoren: 'apps/web/src/features/agents, apps/web/src/features/agentura, packages/chat',
  wissen: 'apps/web/src/features/notebook',
  experimente: 'apps/web/src/features/monitor',
  // Renamed twice (Gruppen → Spaces → Projekte); the code still says "groups"
  // throughout, so the hint points at the old names on purpose.
  konto:
    'apps/web/src/features/wolke, apps/web/src/features/user-defaults, apps/web/src/features/groups, apps/web/src/features/settings',
  integrationen: 'apps/web/src/features/connections, apps/api/routes/mcp-server',
  // The Office articles describe four editors that share one document model, so
  // the hint spans the feature dirs, their packages and the contracts the
  // generated manifest reads. Without this entry no Office code change would
  // ever trigger a docs check.
  office:
    'apps/web/src/features/docs, apps/web/src/features/sheets, apps/web/src/features/presentations, apps/web/src/features/boards, packages/sheets, packages/presentations, packages/docs, packages/chat/src/editor-surface, packages/contracts/src/schemas',
  // Every surface a tour steps through, plus the tour modules themselves — so a
  // PR touching a toured surface re-audits the tour texts (the anchor EXISTENCE
  // check is deterministic: scripts/check-tour-anchors.mjs).
  [TOURS_FOLDER]:
    'apps/web/src/features/tours, apps/web/src/features/workplace, apps/web/src/components/layout/Sidebar, apps/web/src/features/docs, apps/web/src/features/sheets, apps/web/src/features/presentations, apps/web/src/features/image-studio, packages/canvas-editor, packages/presentations',
  // README claims are structural (workspace layout, commands, AI providers, env
  // vars), so the reverse map triggers on structural files — a bare
  // "package.json" prefix only matches the root manifest since changed paths are
  // repo-relative.
  [README_FOLDER]:
    'pnpm-workspace.yaml, package.json, turbo.json, .env.example, apps/api/services/ai',
};

/**
 * Reverse of {@link AREA_HINTS}: given the source files a PR changed, which doc
 * folders could be affected. Coarse (folder-level) on purpose — each folder
 * holds only a few docs, and the AI audit filters false positives downstream.
 */
export function foldersForChangedFiles(changedFiles: string[]): string[] {
  const affected = new Set<string>();
  for (const [folder, dirsCsv] of Object.entries(AREA_HINTS)) {
    const prefixes = dirsCsv
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    if (changedFiles.some((f) => prefixes.some((p) => matchesPrefix(f, p)))) {
      affected.add(folder);
    }
  }
  return [...affected];
}

/**
 * A hint entry names either a directory or a single file, and both have to match
 * on a path boundary.
 *
 * A bare `startsWith` does not: `apps/api/services/ai` would also claim
 * `apps/api/services/aiSearchAgent.ts` — the file that made this concrete until
 * it was deleted (16.08.2026, toter Dienst ohne Aufrufer). Every edit to it
 * would have dragged three doc folders into the audit for nothing. No tracked
 * file collides this way today, which is exactly why the boundary check has to
 * stay: the next `services/ai…`-sibling would reintroduce it silently.
 * Over-triggering is the mild direction of this bug — the audit is advisory and
 * the agent filters false positives — but it costs one agent run per doc and
 * teaches people to skim past the comment it posts.
 */
function matchesPrefix(changedFile: string, prefix: string): boolean {
  return changedFile === prefix || changedFile.startsWith(`${prefix}/`);
}
