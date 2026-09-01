/**
 * Entscheidet, ob ein Werkzeugaufruf eine Freigabe durch die Nutzer*in braucht.
 * Rein und ohne I/O — die Allowlist wird einmal pro Zug geladen und hier nur
 * gelesen.
 */

import { type ToolOrigin } from './types.js';

export type ApprovalVerdict =
  | {
      required: false;
      reason:
        'flag_off' | 'internal' | 'confirm_action_gated' | 'allowlisted' | 'managed_read_only';
    }
  | { required: true; scopeKey: string };

/**
 * Interne Werkzeuge mit Seiteneffekt, die das Gate abdecken soll. Bewusst leer:
 * die Schreibpfade in `personalDataTools.ts` fragen bereits über `confirm_action`
 * bzw. ihr eigenes `confirm=true`, und die Generierungswerkzeuge (`create_*`)
 * ruft `createAfterGather` am UNgewrappten Katalog auf — ein Eintrag hier würde
 * dort stillschweigend übergangen. Wer die Menge füllt, muss zuerst die
 * Garantie-Schicht mit demselben Gate versehen.
 */
export const INTERNAL_APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set<string>();

/** Fragen schon selbst — ein zweites Gate wäre eine doppelte Rückfrage. */
export const CONFIRM_ACTION_GATED_TOOLS: ReadonlySet<string> = new Set([
  'documents',
  'boards_tasks',
  'media',
  'notebooks',
  'groups',
  // `cloud_files` liest nur; seine einzige wirksame Aktion (`add_connection`)
  // emittiert selbst eine `confirm_action`-Karte.
  'cloud_files',
  // `create` ist eine Karte, `delete` der `confirm=true`-Zweischritt; der Rest
  // ist privat und umkehrbar.
  'recurring_tasks',
  // `create` und `share_to_group` sind Karten, `delete` der Zweischritt;
  // `update` ist privat und umkehrbar.
  'user_agents',
  // `delete` ist der `confirm=true`-Zweischritt; `create` und `add_examples`
  // sind privat und umkehrbar (delete), sie zeigen keine Karte.
  'recipes',
]);

export function approvalScopeKey(toolName: string, origin?: ToolOrigin | null): string {
  if (!origin) return `internal/${toolName}`;
  return `${origin.kind}:${origin.serverId}/${origin.remoteToolName}`;
}

/**
 * Konnektor-Werkzeuge sind grundsätzlich freigabepflichtig: sie führen fremden
 * Code aus, und ihre Wirkung steht in keiner Tabelle, die wir pflegen. Ein
 * unbekanntes Werkzeug fällt damit in die sichere Richtung.
 *
 * EINE Ausnahme, und sie ist die einzige Stelle, an der ein Server über sein
 * eigenes Gatter mitredet: ein `readOnlyHint: true` erlässt die Frage NUR bei
 * `kind: 'managed'`. Das sind die fünf von uns betriebenen Konnektoren
 * (systemMcpServers.ts) — die Annotation kommt dort aus unserem eigenen
 * Deploy, also aus derselben Quelle wie bei einem internen Werkzeug, das
 * ohnehin ungefragt läuft.
 *
 * Für `kind: 'mcp'` wird der Hinweis NIE gelesen — die MCP-Spec führt
 * Annotationen ausdrücklich als nicht vertrauenswürdig. Sonst hätte jeder per
 * URL eingefügte Server einen Schalter, sein eigenes Gatter abzuschalten. Aus demselben Grund muss der Hinweis auch nicht in den
 * Fingerabdruck (mcpToolDrift.ts) — was nie gelesen wird, kann auch nicht
 * nachträglich umgelegt werden.
 *
 * Der fehlende Hinweis bedeutet „der Server hat nichts gesagt", nicht „nein":
 * ohne Annotation bleibt alles, wie es war, und die Frage wird gestellt.
 */
export function evaluateApproval(params: {
  toolName: string;
  origin?: ToolOrigin | null;
  allowlist: ReadonlySet<string>;
  flagEnabled: boolean;
}): ApprovalVerdict {
  const { toolName, origin, allowlist, flagEnabled } = params;
  if (!flagEnabled) return { required: false, reason: 'flag_off' };

  if (!origin) {
    if (CONFIRM_ACTION_GATED_TOOLS.has(toolName)) {
      return { required: false, reason: 'confirm_action_gated' };
    }
    if (!INTERNAL_APPROVAL_REQUIRED_TOOLS.has(toolName)) {
      return { required: false, reason: 'internal' };
    }
  }

  // `origin.readOnlyHint` trägt den Hinweis JEDES Servers ungefiltert — die
  // Kataloge filtern nichts vor. Erst der `kind`-Vergleich hier entscheidet,
  // wessen Hinweis zählt.
  if (origin?.kind === 'managed' && origin.readOnlyHint === true) {
    return { required: false, reason: 'managed_read_only' };
  }

  const scopeKey = approvalScopeKey(toolName, origin);
  if (allowlist.has(scopeKey)) return { required: false, reason: 'allowlisted' };
  return { required: true, scopeKey };
}

export function isToolApprovalEnabled(): boolean {
  return process.env.CHAT_TOOL_APPROVAL === 'true';
}
