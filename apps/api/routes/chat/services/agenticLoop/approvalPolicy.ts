/**
 * Entscheidet, ob ein Werkzeugaufruf eine Freigabe durch die Nutzer*in braucht.
 * Rein und ohne I/O — die Allowlist wird einmal pro Zug geladen und hier nur
 * gelesen.
 */

import { type ToolOrigin } from './types.js';

export type ApprovalVerdict =
  | { required: false; reason: 'flag_off' | 'internal' | 'confirm_action_gated' | 'allowlisted' }
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
]);

export function approvalScopeKey(toolName: string, origin?: ToolOrigin | null): string {
  if (!origin) return `internal/${toolName}`;
  return `${origin.kind}:${origin.serverId}/${origin.remoteToolName}`;
}

/**
 * Konnektor-Werkzeuge sind grundsätzlich freigabepflichtig, auch die von uns
 * betriebenen: sie führen fremden Code aus, und ihre Wirkung steht in keiner
 * Tabelle, die wir pflegen. Ein unbekanntes Werkzeug fällt damit in die
 * sichere Richtung.
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

  const scopeKey = approvalScopeKey(toolName, origin);
  if (allowlist.has(scopeKey)) return { required: false, reason: 'allowlisted' };
  return { required: true, scopeKey };
}

/**
 * `shadow` berechnet jedes Verdikt wie `enforce`, hält aber nichts zurück: der
 * Zug läuft durch, und im Log steht, wobei gefragt worden wäre. Damit lässt
 * sich vor dem Scharfschalten an echtem Verkehr messen, wie oft das Gate feuern
 * würde und für welche Werkzeuge — die Zahl, an der die Ausnahme für lesende
 * Konnektor-Werkzeuge (#3018) hängt.
 */
export type ToolApprovalMode = 'off' | 'shadow' | 'enforce';

export function toolApprovalMode(): ToolApprovalMode {
  const raw = process.env.CHAT_TOOL_APPROVAL?.trim().toLowerCase();
  if (raw === 'shadow') return 'shadow';
  return raw === 'true' ? 'enforce' : 'off';
}
